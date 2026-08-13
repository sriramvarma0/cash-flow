import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(ownerId: string, name: string) {
    return this.prisma.group.create({
      data: {
        name: name.trim(),
        ownerId,
        members: {
          connect: { id: ownerId }
        }
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true }
        },
        members: {
          select: { id: true, name: true, email: true, phoneNumber: true }
        }
      }
    });
  }

  async findAll(userId: string) {
    return this.prisma.group.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { id: userId } } }
        ]
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true }
        },
        members: {
          select: { id: true, name: true, email: true, phoneNumber: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async invite(ownerId: string, groupId: string, email?: string, phoneNumber?: string) {
    if (!email && !phoneNumber) {
      throw new BadRequestException('Provide either email or phone number to invite.');
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.ownerId !== ownerId) {
      throw new ForbiddenException('Only the group owner can invite members.');
    }

    const targetEmail = email?.trim().toLowerCase() || null;
    const targetPhone = phoneNumber?.trim() || null;

    // Check if invitation already exists and is pending
    const existing = await this.prisma.invitation.findFirst({
      where: {
        groupId,
        status: 'PENDING',
        AND: [
          targetEmail ? { inviteeEmail: targetEmail } : {},
          targetPhone ? { inviteePhone: targetPhone } : {}
        ]
      }
    });

    if (existing) {
      throw new BadRequestException('A pending invitation already exists for this member.');
    }

    return this.prisma.invitation.create({
      data: {
        groupId,
        inviteeEmail: targetEmail,
        inviteePhone: targetPhone
      }
    });
  }

  async findPendingInvitations(userEmail: string, userPhone: string) {
    return this.prisma.invitation.findMany({
      where: {
        status: 'PENDING',
        OR: [
          userEmail ? { inviteeEmail: userEmail.toLowerCase() } : {},
          userPhone ? { inviteePhone: userPhone } : {}
        ]
      },
      include: {
        group: {
          include: {
            owner: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async respondToInvitation(
    userId: string,
    userEmail: string,
    userPhone: string,
    invitationId: string,
    accept: boolean
  ) {
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        id: invitationId,
        status: 'PENDING',
        OR: [
          userEmail ? { inviteeEmail: userEmail.toLowerCase() } : {},
          userPhone ? { inviteePhone: userPhone } : {}
        ]
      }
    });

    if (!invitation) {
      throw new NotFoundException('Pending invitation not found or unauthorized.');
    }

    if (accept) {
      await this.prisma.$transaction([
        this.prisma.invitation.update({
          where: { id: invitationId },
          data: { status: 'ACCEPTED' }
        }),
        this.prisma.group.update({
          where: { id: invitation.groupId },
          data: {
            members: {
              connect: { id: userId }
            }
          }
        })
      ]);
      return { success: true, status: 'ACCEPTED' };
    } else {
      await this.prisma.invitation.update({
        where: { id: invitationId },
        data: { status: 'DECLINED' }
      });
      return { success: true, status: 'DECLINED' };
    }
  }

  async findGroupExpenses(groupId: string, userId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          select: { id: true }
        }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const isMember = group.members.some((m) => m.id === userId) || group.ownerId === userId;
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this group.');
    }

    const memberIds = group.members.map((m) => m.id);

    return this.prisma.expense.findMany({
      where: {
        userId: { in: memberIds },
        transactionType: { in: ['EXPENSE', 'INCOME'] }
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { date: 'desc' }
    });
  }
}
