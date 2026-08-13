import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email.toLowerCase());
    if (existingUser) {
      throw new BadRequestException('Email is already in use');
    }

    const existingPhoneNumber = await this.usersService.findByPhoneNumber(dto.phoneNumber);
    if (existingPhoneNumber) {
      throw new BadRequestException('Phone number is already in use');
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      Number(this.configService.get('BCRYPT_ROUNDS') ?? 12)
    );

    const user = await this.usersService.createUser({
      name: dto.name.trim(),
      email: dto.email.toLowerCase(),
      phoneNumber: dto.phoneNumber.trim(),
      passwordHash
    });

    return this.createAuthResponse(user.id, user.email, user.name, user.phoneNumber, user.createdAt);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createAuthResponse(user.id, user.email, user.name, user.phoneNumber, user.createdAt);
  }

  private createAuthResponse(
    userId: string,
    email: string,
    name: string,
    phoneNumber: string,
    createdAt: Date
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
        createdAt
      },
      accessToken: this.jwtService.sign(payload)
    };
  }
}
