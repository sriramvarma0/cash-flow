import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  verifyEmail(@Body() body: { tempToken?: string; email?: string; code?: string; token?: string }) {
    return this.authService.verifyEmail(body);
  }

  @Post('resend-verification')
  resendVerification(@Body() body: { tempToken?: string; email?: string }) {
    return this.authService.resendVerification(body);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('2fa/login')
  verify2faLogin(@Body() body: { tempToken: string; code: string; method?: string }) {
    return this.authService.verify2faLogin(body.tempToken, body.code, body.method);
  }

  @Post('2fa/email/send-login-otp')
  sendLoginEmailOtp(@Body() body: { tempToken: string }) {
    return this.authService.sendLoginEmailOtp(body.tempToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/email/setup')
  setupEmail2fa(@CurrentUser() user: { sub: string }) {
    return this.authService.setupEmail2fa(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/email/enable')
  enableEmail2fa(@CurrentUser() user: { sub: string }, @Body() body: { code: string }) {
    return this.authService.enableEmail2fa(user.sub, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/email/disable')
  disableEmail2fa(
    @CurrentUser() user: { sub: string },
    @Body() body: { password?: string; code?: string }
  ) {
    return this.authService.disableEmail2fa(user.sub, body.password, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('2fa/setup')
  setup2fa(@CurrentUser() user: { sub: string }) {
    return this.authService.setup2fa(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  enable2fa(@CurrentUser() user: { sub: string }, @Body() body: { code: string }) {
    return this.authService.enable2fa(user.sub, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  disable2fa(
    @CurrentUser() user: { sub: string },
    @Body() body: { password?: string; code?: string }
  ) {
    return this.authService.disable2fa(user.sub, body.password, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('2fa/status')
  get2faStatus(@CurrentUser() user: { sub: string }) {
    return this.authService.get2faStatus(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/regenerate-recovery-codes')
  regenerateRecoveryCodes(
    @CurrentUser() user: { sub: string },
    @Body() body: { password?: string }
  ) {
    return this.authService.regenerateRecoveryCodes(user.sub, body.password);
  }
}
