import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
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
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService
  ) {}

  async onModuleInit() {
    await this.ensureSchemaMigration();
  }

  private async ensureSchemaMigration() {
    try {
      const columns: any[] = await this.prisma.$queryRawUnsafe('PRAGMA table_info("User");');
      const colNames = columns.map((c) => c.name);

      if (!colNames.includes('emailOtpEnabled')) {
        await this.prisma.$executeRawUnsafe(
          'ALTER TABLE "User" ADD COLUMN "emailOtpEnabled" BOOLEAN NOT NULL DEFAULT 0;'
        );
      }
      if (!colNames.includes('emailOtpCode')) {
        await this.prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "emailOtpCode" TEXT;');
      }
      if (!colNames.includes('emailOtpExpiresAt')) {
        await this.prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "emailOtpExpiresAt" DATETIME;');
      }
      if (!colNames.includes('isEmailVerified')) {
        await this.prisma.$executeRawUnsafe(
          'ALTER TABLE "User" ADD COLUMN "isEmailVerified" BOOLEAN NOT NULL DEFAULT 1;'
        );
      }
      if (!colNames.includes('emailVerifyCode')) {
        await this.prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "emailVerifyCode" TEXT;');
      }
      if (!colNames.includes('emailVerifyExpiresAt')) {
        await this.prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "emailVerifyExpiresAt" DATETIME;');
      }
      if (!colNames.includes('emailVerifyToken')) {
        await this.prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "emailVerifyToken" TEXT;');
      }
    } catch (err: any) {
      this.logger.warn(`Could not verify User table columns dynamically: ${err.message}`);
    }
  }

  private maskEmail(email: string): string {
    if (!email) return '***';
    const parts = email.split('@');
    if (parts.length !== 2) return '***';
    const [local, domain] = parts;
    const maskedLocal = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : `${local[0]}***`;
    return `${maskedLocal}@${domain}`;
  }

  private generateNumericOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async register(dto: RegisterDto) {
    const emailKey = dto.email.trim().toLowerCase();
    let cleanPhoneNumber = dto.phoneNumber.trim().replace(/[\s()-]/g, '');
    if (!cleanPhoneNumber.startsWith('+')) {
      cleanPhoneNumber = `+${cleanPhoneNumber}`;
    }

    // 1. Validate existing email and phone
    const existingUser = await this.usersService.findByEmail(emailKey);
    if (existingUser) {
      throw new BadRequestException('Email is already in use');
    }

    const existingPhoneNumber = await this.usersService.findByPhoneNumber(cleanPhoneNumber);
    if (existingPhoneNumber) {
      throw new BadRequestException('Phone number is already in use');
    }

    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long for maximum security.');
    }

    // 2. Hash password and create user with unverified email status
    const passwordHash = await bcrypt.hash(
      dto.password,
      Number(this.configService.get('BCRYPT_ROUNDS') ?? 12)
    );

    const verifyCode = this.generateNumericOtp();
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await this.usersService.createUser({
      name: dto.name.trim(),
      email: emailKey,
      phoneNumber: cleanPhoneNumber,
      passwordHash,
      isEmailVerified: false,
      emailVerifyCode: verifyCode,
      emailVerifyExpiresAt: verifyExpiresAt,
      emailVerifyToken: verifyToken
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const verificationUrl = `${frontendUrl}/verify-email?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;

    try {
      await this.emailService.sendAccountVerification(user.email, {
        name: user.name,
        verificationUrl,
        code: verifyCode,
        expiresInMinutes: 1440
      });
    } catch (err: any) {
      this.logger.error(`Failed to dispatch account verification email to ${this.maskEmail(user.email)}: ${err.message}`);
    }

    const tempToken = this.jwtService.sign(
      { sub: user.id, email: user.email, isVerifyPending: true },
      { expiresIn: '24h' }
    );

    return {
      requiresVerification: true,
      tempToken,
      email: user.email,
      maskedEmail: this.maskEmail(user.email),
      message: `Account created! We've sent a 6-digit verification code to ${this.maskEmail(user.email)}.`
    };
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

    // 2.5 Check Email Verification Status
    if (user.isEmailVerified === false) {
      const tempToken = this.jwtService.sign(
        { sub: user.id, email: user.email, isVerifyPending: true },
        { expiresIn: '24h' }
      );
      return {
        requiresVerification: true,
        tempToken,
        email: user.email,
        maskedEmail: this.maskEmail(user.email),
        message: `Your email address is not verified yet. Please enter the verification code sent to ${this.maskEmail(user.email)}.`
      };
    }

    // 3. Check Two-Factor Authentication (2FA) - Supports Authenticator (TOTP) and Email OTP
    const isTotp = user.twoFactorEnabled && !!user.twoFactorSecret;
    const isEmail = !!user.emailOtpEnabled;

    if (isTotp || isEmail) {
      const tempToken = this.jwtService.sign(
        { sub: user.id, email: user.email, is2faPending: true },
        { expiresIn: '10m' }
      );

      const availableMethods: ('totp' | 'email')[] = [];
      if (isTotp) availableMethods.push('totp');
      if (isEmail) availableMethods.push('email');

      const defaultMethod: 'totp' | 'email' = isTotp ? 'totp' : 'email';

      // Auto-dispatch OTP if email is the active default method
      if (defaultMethod === 'email') {
        await this.sendLoginEmailOtpInternal(user.id, user.email, user.name);
      }

      return {
        requires2FA: true,
        tempToken,
        defaultMethod,
        availableMethods,
        email: this.maskEmail(user.email),
        message: isTotp
          ? 'Two-Factor Authentication required. Enter the 6-digit code from your authenticator app or email.'
          : `Two-Factor Authentication required. A 6-digit verification code has been sent to ${this.maskEmail(user.email)}.`
      };
    }

    return this.createAuthResponse(
      user.id,
      user.email,
      user.name,
      user.phoneNumber,
      user.createdAt,
      user.twoFactorEnabled || user.emailOtpEnabled
    );
  }

  async sendLoginEmailOtp(tempToken: string) {
    if (!tempToken) {
      throw new BadRequestException('Temporary session token is required.');
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
    if (!user || !user.emailOtpEnabled) {
      throw new BadRequestException('Email Two-Factor Authentication is not enabled for this user.');
    }

    await this.sendLoginEmailOtpInternal(user.id, user.email, user.name);

    return {
      success: true,
      message: `Verification code sent to ${this.maskEmail(user.email)}.`,
      email: this.maskEmail(user.email)
    };
  }

  private async sendLoginEmailOtpInternal(userId: string, email: string, name?: string) {
    const code = this.generateNumericOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailOtpCode: code,
        emailOtpExpiresAt: expiresAt
      }
    });

    try {
      await this.emailService.sendTwoFactorOtp(email, {
        name,
        code,
        purpose: 'login',
        expiresInMinutes: 10
      });
    } catch (err: any) {
      this.logger.error(`Failed to send 2FA login email to ${this.maskEmail(email)}: ${err.message}`);
      throw new BadRequestException('Failed to deliver verification email. Please check your email configuration.');
    }
  }

  async verify2faLogin(tempToken: string, code: string, method?: string) {
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
    if (!user || (!user.twoFactorEnabled && !user.emailOtpEnabled)) {
      throw new UnauthorizedException('Two-Factor Authentication is not enabled for this user.');
    }

    if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
      const waitMinutes = Math.ceil((new Date(user.lockoutUntil).getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(`Account is locked. Try again in ${waitMinutes} minute(s).`);
    }

    const cleanCode = code.trim();

    // 1. Verify Email OTP if enabled
    if (user.emailOtpEnabled && user.emailOtpCode && user.emailOtpExpiresAt) {
      const notExpired = new Date(user.emailOtpExpiresAt).getTime() > Date.now();
      if (notExpired && cleanCode === user.emailOtpCode.trim()) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            emailOtpCode: null,
            emailOtpExpiresAt: null,
            failedLoginAttempts: 0,
            lockoutUntil: null
          }
        });

        return this.createAuthResponse(
          user.id,
          user.email,
          user.name,
          user.phoneNumber,
          user.createdAt,
          true
        );
      }
    }

    // 2. Verify 6-digit TOTP code if enabled
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const isTotpValid = verifyTotpCode(cleanCode, user.twoFactorSecret);
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
    }

    // 3. Verify Backup / Recovery code if user has authenticator enabled
    if (user.twoFactorRecoveryCodes) {
      const { valid, remainingHashes } = verifyAndConsumeRecoveryCode(cleanCode, user.twoFactorRecoveryCodes);
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
      `Invalid verification code or recovery code. Attempt ${attempts} of 5.`
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
      throw new BadRequestException(
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
      enabled: !!(user.twoFactorEnabled || user.emailOtpEnabled),
      totpEnabled: !!user.twoFactorEnabled,
      emailOtpEnabled: !!user.emailOtpEnabled,
      email: user.email,
      maskedEmail: this.maskEmail(user.email),
      remainingRecoveryCodes: remainingCodes
    };
  }

  async setupEmail2fa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const code = this.generateNumericOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailOtpCode: code,
        emailOtpExpiresAt: expiresAt
      }
    });

    try {
      await this.emailService.sendTwoFactorOtp(user.email, {
        name: user.name,
        code,
        purpose: 'setup',
        expiresInMinutes: 10
      });
    } catch (err: any) {
      this.logger.error(`Failed to send 2FA setup email to ${this.maskEmail(user.email)}: ${err.message}`);
      throw new BadRequestException('Failed to deliver setup code via email. Please check your email configuration.');
    }

    return {
      success: true,
      message: `A 6-digit confirmation code has been sent to ${this.maskEmail(user.email)}.`,
      email: this.maskEmail(user.email)
    };
  }

  async enableEmail2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.emailOtpCode || !user.emailOtpExpiresAt) {
      throw new BadRequestException('No pending email verification code. Please request a new setup code.');
    }

    if (Date.now() > new Date(user.emailOtpExpiresAt).getTime()) {
      throw new BadRequestException('Verification code has expired. Please request a new setup code.');
    }

    if (code.trim() !== user.emailOtpCode.trim()) {
      throw new BadRequestException('Invalid verification code. Please check your email and try again.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailOtpEnabled: true,
        emailOtpCode: null,
        emailOtpExpiresAt: null
      }
    });

    return {
      success: true,
      message: 'Email Two-Factor Authentication is now enabled for your account!'
    };
  }

  async disableEmail2fa(userId: string, password?: string, code?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.emailOtpEnabled) {
      throw new BadRequestException('Email Two-Factor Authentication is already disabled.');
    }

    let verified = false;
    if (password) {
      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      if (passwordMatches) verified = true;
    }
    if (!verified && code && user.emailOtpCode) {
      if (code.trim() === user.emailOtpCode.trim()) verified = true;
    }

    if (!verified) {
      throw new BadRequestException(
        'Security verification failed: Provide your current account password to disable Email 2FA.'
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailOtpEnabled: false,
        emailOtpCode: null,
        emailOtpExpiresAt: null
      }
    });

    return {
      success: true,
      message: 'Email Two-Factor Authentication has been successfully disabled.'
    };
  }

  async regenerateRecoveryCodes(userId: string, password?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('Two-Factor Authentication must be enabled to regenerate recovery codes.');
    }

    if (password) {
      const matches = await bcrypt.compare(password, user.passwordHash);
      if (!matches) throw new BadRequestException('Current password does not match.');
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

  async verifyEmail(dto: { tempToken?: string; email?: string; code?: string; token?: string }) {
    let userId: string | undefined;
    let email: string | undefined;

    if (dto.tempToken) {
      try {
        const decoded: any = this.jwtService.verify(dto.tempToken);
        userId = decoded.sub;
        email = decoded.email;
      } catch {
        throw new UnauthorizedException(
          'Verification session expired or invalid token. Please log in or request a new code.'
        );
      }
    }

    let user: any;
    if (userId) {
      user = await this.prisma.user.findUnique({ where: { id: userId } });
    } else if (dto.email) {
      user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    } else if (dto.token) {
      user = await this.prisma.user.findFirst({ where: { emailVerifyToken: dto.token.trim() } });
    }

    if (!user) {
      throw new BadRequestException('User not found or invalid verification request.');
    }

    if (user.isEmailVerified) {
      return {
        ...this.createAuthResponse(
          user.id,
          user.email,
          user.name,
          user.phoneNumber,
          user.createdAt,
          user.twoFactorEnabled || user.emailOtpEnabled,
          true
        ),
        message: 'Email is already verified.'
      };
    }

    if (user.emailVerifyExpiresAt && new Date(user.emailVerifyExpiresAt).getTime() < Date.now()) {
      throw new BadRequestException('Verification code or link has expired. Please request a new verification code.');
    }

    if (dto.code) {
      if (!user.emailVerifyCode || dto.code.trim() !== user.emailVerifyCode.trim()) {
        throw new BadRequestException('Invalid verification code. Please check your email and try again.');
      }
    } else if (dto.token) {
      if (!user.emailVerifyToken || dto.token.trim() !== user.emailVerifyToken.trim()) {
        throw new BadRequestException('Invalid or expired verification link.');
      }
    } else {
      throw new BadRequestException('Verification code or link token is required.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifyCode: null,
        emailVerifyExpiresAt: null,
        emailVerifyToken: null
      }
    });

    return {
      ...this.createAuthResponse(
        updatedUser.id,
        updatedUser.email,
        updatedUser.name,
        updatedUser.phoneNumber,
        updatedUser.createdAt,
        updatedUser.twoFactorEnabled || updatedUser.emailOtpEnabled,
        true
      ),
      message: 'Email verified successfully! Welcome to CashFlow.'
    };
  }

  async resendVerification(dto: { tempToken?: string; email?: string }) {
    let userId: string | undefined;
    let email: string | undefined;

    if (dto.tempToken) {
      try {
        const decoded: any = this.jwtService.verify(dto.tempToken);
        userId = decoded.sub;
        email = decoded.email;
      } catch {
        // Fall back to dto.email
      }
    }

    let user: any;
    if (userId) {
      user = await this.prisma.user.findUnique({ where: { id: userId } });
    } else if (dto.email || email) {
      user = await this.prisma.user.findUnique({ where: { email: (dto.email || email)!.trim().toLowerCase() } });
    }

    if (!user) {
      throw new BadRequestException('User not found.');
    }

    if (user.isEmailVerified) {
      return {
        success: true,
        alreadyVerified: true,
        message: 'Your email address is already verified. You can log in directly.'
      };
    }

    const verifyCode = this.generateNumericOtp();
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifyCode: verifyCode,
        emailVerifyToken: verifyToken,
        emailVerifyExpiresAt: verifyExpiresAt
      }
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const verificationUrl = `${frontendUrl}/verify-email?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;

    try {
      await this.emailService.sendAccountVerification(user.email, {
        name: user.name,
        verificationUrl,
        code: verifyCode,
        expiresInMinutes: 1440
      });
    } catch (err: any) {
      this.logger.error(`Failed to resend verification email to ${this.maskEmail(user.email)}: ${err.message}`);
      throw new BadRequestException('Failed to deliver verification email. Please check your email configuration.');
    }

    const tempToken = this.jwtService.sign(
      { sub: user.id, email: user.email, isVerifyPending: true },
      { expiresIn: '24h' }
    );

    return {
      success: true,
      tempToken,
      email: user.email,
      maskedEmail: this.maskEmail(user.email),
      message: `A new verification code has been sent to ${this.maskEmail(user.email)}.`
    };
  }

  private createAuthResponse(
    userId: string,
    email: string,
    name: string,
    phoneNumber: string,
    createdAt: Date,
    twoFactorEnabled: boolean = false,
    isEmailVerified: boolean = true
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
        twoFactorEnabled,
        isEmailVerified
      },
      accessToken: this.jwtService.sign(payload)
    };
  }
}
