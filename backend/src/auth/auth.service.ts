import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload';
import {
  generateTotpSecret,
  generateOtpAuthUri,
  generateQrCodeDataUrl,
  verifyTotpCode,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode
} from '../common/utils/totp.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async register(dto: RegisterDto) {
    const emailKey = dto.email.trim().toLowerCase();

    // 1. Validate existing email and phone
    const existingUser = await this.usersService.findByEmail(emailKey);
    if (existingUser) {
      throw new BadRequestException('Email is already in use');
    }

    const existingPhoneNumber = await this.usersService.findByPhoneNumber(dto.phoneNumber);
    if (existingPhoneNumber) {
      throw new BadRequestException('Phone number is already in use');
    }

    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long for maximum security.');
    }

    // 2. Hash password and create user
    const passwordHash = await bcrypt.hash(
      dto.password,
      Number(this.configService.get('BCRYPT_ROUNDS') ?? 12)
    );

    const user = await this.usersService.createUser({
      name: dto.name.trim(),
      email: emailKey,
      phoneNumber: dto.phoneNumber.trim(),
      passwordHash
    });

    return this.createAuthResponse(user.id, user.email, user.name, user.phoneNumber, user.createdAt, false);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() }
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 1. Check account lockout due to brute force
    if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
      const waitMinutes = Math.ceil((new Date(user.lockoutUntil).getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Account is temporarily locked due to too many failed login attempts. Try again in ${waitMinutes} minute(s).`
      );
    }

    // 2. Validate password
    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const lockout = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockoutUntil: lockout
        }
      });

      if (attempts >= 5) {
        throw new UnauthorizedException(
          'Maximum security lock: account locked for 15 minutes due to 5 consecutive failed login attempts.'
        );
      }
      throw new UnauthorizedException(`Invalid email or password. Attempt ${attempts} of 5.`);
    }

    // Reset failed attempts on valid password
    if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockoutUntil: null }
      });
    }

    // 3. Check Two-Factor Authentication (2FA)
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const tempToken = this.jwtService.sign(
        { sub: user.id, email: user.email, is2faPending: true },
        { expiresIn: '10m' }
      );

      return {
        requires2FA: true,
        tempToken,
        message: 'Two-Factor Authentication required. Enter the 6-digit code from your authenticator app.'
      };
    }

    return this.createAuthResponse(
      user.id,
      user.email,
      user.name,
      user.phoneNumber,
      user.createdAt,
      user.twoFactorEnabled
    );
  }

  async verify2faLogin(tempToken: string, code: string) {
    if (!tempToken || !code) {
      throw new BadRequestException('Temporary session token and 2FA verification code are required.');
    }

    let decoded: any;
    try {
      decoded = this.jwtService.verify(tempToken);
    } catch {
      throw new UnauthorizedException('Session expired or invalid temporary token. Please sign in again.');
    }

    if (!decoded.is2faPending || !decoded.sub) {
      throw new UnauthorizedException('Invalid 2FA challenge session.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('Two-Factor Authentication is not enabled for this user.');
    }

    if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
      const waitMinutes = Math.ceil((new Date(user.lockoutUntil).getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`Account is locked. Try again in ${waitMinutes} minute(s).`);
    }

    // 1. Verify 6-digit TOTP code
    const isTotpValid = verifyTotpCode(code, user.twoFactorSecret);
    if (isTotpValid) {
      if (user.failedLoginAttempts > 0) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockoutUntil: null }
        });
      }
      return this.createAuthResponse(
        user.id,
        user.email,
        user.name,
        user.phoneNumber,
        user.createdAt,
        true
      );
    }

    // 2. Verify Backup / Recovery code
    const { valid, remainingHashes } = verifyAndConsumeRecoveryCode(code, user.twoFactorRecoveryCodes);
    if (valid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorRecoveryCodes: JSON.stringify(remainingHashes),
          failedLoginAttempts: 0,
          lockoutUntil: null
        }
      });

      const authRes = this.createAuthResponse(
        user.id,
        user.email,
        user.name,
        user.phoneNumber,
        user.createdAt,
        true
      );
      return {
        ...authRes,
        recoveryCodeUsed: true,
        remainingRecoveryCodes: remainingHashes.length,
        message: `Backup recovery code accepted. You have ${remainingHashes.length} recovery code(s) remaining.`
      };
    }

    // Handle invalid 2FA attempt
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const lockout = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: attempts, lockoutUntil: lockout }
    });

    if (attempts >= 5) {
      throw new UnauthorizedException(
        'Account locked for 15 minutes due to 5 consecutive failed 2FA verification attempts.'
      );
    }

    throw new UnauthorizedException(
      `Invalid 6-digit authenticator code or backup recovery code. Attempt ${attempts} of 5.`
    );
  }

  async setup2fa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const secret = generateTotpSecret();
    const otpauthUri = generateOtpAuthUri(user.email, secret, 'CashFlow');
    const qrCode = await generateQrCodeDataUrl(otpauthUri);

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorTempSecret: secret }
    });

    return {
      secret,
      otpauthUri,
      qrCode,
      issuer: 'CashFlow',
      accountName: user.email
    };
  }

  async enable2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.twoFactorTempSecret) {
      throw new BadRequestException('Please initiate 2FA setup first by requesting an Authenticator QR code.');
    }

    const isValid = verifyTotpCode(code, user.twoFactorTempSecret);
    if (!isValid) {
      throw new BadRequestException(
        'Invalid 6-digit verification code. Please make sure your mobile device clock is synced and enter the code from your Authenticator app.'
      );
    }

    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: user.twoFactorTempSecret,
        twoFactorTempSecret: null,
        twoFactorRecoveryCodes: JSON.stringify(hashedCodes)
      }
    });

    return {
      success: true,
      message: 'Two-Factor Authentication (2FA) is now enabled for your account!',
      recoveryCodes: plainCodes
    };
  }

  async disable2fa(userId: string, password?: string, code?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-Factor Authentication is already disabled.');
    }

    let verified = false;
    if (password) {
      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      if (passwordMatches) verified = true;
    }
    if (!verified && code && user.twoFactorSecret) {
      if (verifyTotpCode(code, user.twoFactorSecret)) verified = true;
    }

    if (!verified) {
      throw new UnauthorizedException(
        'Security verification failed: Provide your current account password or 6-digit 2FA code to disable 2FA.'
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorTempSecret: null,
        twoFactorRecoveryCodes: null
      }
    });

    return {
      success: true,
      message: 'Two-Factor Authentication has been successfully disabled.'
    };
  }

  async get2faStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let remainingCodes = 0;
    if (user.twoFactorRecoveryCodes) {
      try {
        const parsed = JSON.parse(user.twoFactorRecoveryCodes);
        remainingCodes = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        remainingCodes = 0;
      }
    }

    return {
      enabled: user.twoFactorEnabled,
      remainingRecoveryCodes: remainingCodes
    };
  }

  async regenerateRecoveryCodes(userId: string, password?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('Two-Factor Authentication must be enabled to regenerate recovery codes.');
    }

    if (password) {
      const matches = await bcrypt.compare(password, user.passwordHash);
      if (!matches) throw new UnauthorizedException('Current password does not match.');
    }

    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorRecoveryCodes: JSON.stringify(hashedCodes) }
    });

    return {
      success: true,
      recoveryCodes: plainCodes,
      message: 'New recovery codes generated. All previous recovery codes have been revoked.'
    };
  }

  private createAuthResponse(
    userId: string,
    email: string,
    name: string,
    phoneNumber: string,
    createdAt: Date,
    twoFactorEnabled: boolean = false
  ) {
    const payload: JwtPayload = {
      sub: userId,
      email,
      name
    };

    return {
      user: {
        id: userId,
        email,
        name,
        phoneNumber,
        createdAt,
        twoFactorEnabled
      },
      accessToken: this.jwtService.sign(payload)
    };
  }
}
