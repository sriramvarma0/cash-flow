import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../types/jwt-payload';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret
    });
  }

  async validate(payload: JwtPayload) {
    // If payload contains email, ensure the user's current 10-digit numeric ID is returned
    if (payload.email) {
      const user = await this.usersService.findByEmail(payload.email);
      if (user) {
        return {
          sub: user.id,
          email: user.email,
          name: user.name
        };
      }
    }
    return payload;
  }
}
