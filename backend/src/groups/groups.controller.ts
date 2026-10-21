import { Body, Controller, Get, Param, Post, UseGuards, NotFoundException } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { RespondInvitationDto } from './dto/respond-invitation.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly usersService: UsersService
  ) {}

  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateGroupDto) {
    return this.groupsService.createGroup(user.sub, dto.name);
  }

  @Get()
  findAll(@CurrentUser() user: { sub: string }) {
    return this.groupsService.findAll(user.sub);
  }

  @Post(':id/invite')
  invite(
    @CurrentUser() user: { sub: string },
    @Param('id') groupId: string,
    @Body() dto: InviteMemberDto
  ) {
    return this.groupsService.invite(user.sub, groupId, dto.email, dto.phoneNumber, dto.userId);
  }

  @Get('invitations')
  async getInvitations(@CurrentUser() user: { sub: string }) {
    const dbUser = await this.usersService.findById(user.sub);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }
    return this.groupsService.findPendingInvitations(dbUser.email, dbUser.phoneNumber);
  }

  @Post('invitations/:inviteId/respond')
  async respond(
    @CurrentUser() user: { sub: string },
    @Param('inviteId') inviteId: string,
    @Body() dto: RespondInvitationDto
  ) {
    const dbUser = await this.usersService.findById(user.sub);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }
    return this.groupsService.respondToInvitation(
      dbUser.id,
      dbUser.email,
      dbUser.phoneNumber,
      inviteId,
      dto.accept
    );
  }

  @Post(':id/request-join')
  async requestJoin(
    @CurrentUser() user: { sub: string },
    @Param('id') groupId: string
  ) {
    return this.groupsService.requestToJoinGroup(user.sub, groupId);
  }

  @Get('join-requests')
  async getGroupJoinRequests(@CurrentUser() user: { sub: string }) {
    return this.groupsService.findGroupJoinRequests(user.sub);
  }

  @Post('join-requests/:requestId/respond')
  async respondToJoinRequest(
    @CurrentUser() user: { sub: string },
    @Param('requestId') requestId: string,
    @Body() dto: RespondInvitationDto
  ) {
    return this.groupsService.respondToJoinRequest(user.sub, requestId, dto.accept);
  }

  @Get('my-requests')
  async getMySentRequests(@CurrentUser() user: { sub: string }) {
    const dbUser = await this.usersService.findById(user.sub);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }
    return this.groupsService.findUserSentJoinRequests(dbUser.email, dbUser.phoneNumber);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { sub: string }, @Param('id') groupId: string) {
    return this.groupsService.findOne(groupId, user.sub);
  }

  @Post(':id/toggle-admin')
  toggleAdmin(
    @CurrentUser() user: { sub: string },
    @Param('id') groupId: string,
    @Body() body: { memberId: string }
  ) {
    return this.groupsService.toggleAdmin(user.sub, groupId, body.memberId);
  }

  @Get(':id/expenses')
  findGroupExpenses(@CurrentUser() user: { sub: string }, @Param('id') groupId: string) {
    return this.groupsService.findGroupExpenses(groupId, user.sub);
  }
}
