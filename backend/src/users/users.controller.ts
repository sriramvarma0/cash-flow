import { Controller, Get, Post, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { sub: string }) {
    const profile = await this.usersService.findById(user.sub);
    if (!profile) {
      throw new UnauthorizedException('User not found');
    }

    return this.usersService.toSafeUser(profile);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/change-password')
  async changePassword(
    @CurrentUser() user: { sub: string },
    @Body() body: { currentPassword: string; newPassword: string }
  ) {
    return this.usersService.changePassword(user.sub, body.currentPassword, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/export')
  async exportAccountData(@CurrentUser() user: { sub: string }) {
    return this.usersService.exportAccountData(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/import')
  async importAccountData(
    @CurrentUser() user: { sub: string },
    @Body() payload: any
  ) {
    return this.usersService.importAccountData(user.sub, payload);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll() {
    return this.usersService.findAll();
  }
}
