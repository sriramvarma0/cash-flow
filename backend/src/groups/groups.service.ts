import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateGroupTrackingId } from '../common/utils/uuid7.util';

export function parseAdminIds(adminIdsStr?: string | null): string[] {
  if (!adminIdsStr) return [];
  try {
    const parsed = JSON.parse(adminIdsStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return adminIdsStr.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(ownerId: string, name: string) {
    let groupId = generateGroupTrackingId();
    while (await this.prisma.group.findUnique({ where: { id: groupId } })) {
      groupId = generateGroupTrackingId();
    }

    return this.prisma.group.create({
      data: {
        id: groupId,
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
          select: { id: true, name: true, email: true, phoneNumber: true }
        },
        members: {
          select: { id: true, name: true, email: true, phoneNumber: true }
        },
        invitations: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(groupId: string, userId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        owner: {
          select: { id: true, name: true, email: true, phoneNumber: true }
        },
        members: {
          select: { id: true, name: true, email: true, phoneNumber: true }
        },
        invitations: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const isMember = group.members.some((m) => m.id === userId);
    const isOwner = group.ownerId === userId;
    const admins = parseAdminIds(group.adminIds);
    const isAdmin = admins.includes(userId);

    const taggedMembers = group.members.map((m) => {
      let role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER';
      if (m.id === group.ownerId) role = 'OWNER';
      else if (admins.includes(m.id)) role = 'ADMIN';

      return {
        ...m,
        role,
        isOwner: m.id === group.ownerId,
        isAdmin: admins.includes(m.id)
      };
    });

    const joinRequests = group.invitations.filter((inv) => inv.status === 'REQUESTED');
    const sentInvitations = group.invitations.filter((inv) => inv.status === 'PENDING');

    return {
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      ownerId: group.ownerId,
      owner: group.owner,
      adminIds: group.adminIds,
      memberCount: group.members.length,
      isMember,
      isOwner,
      isAdmin,
      canAddMembers: isOwner || isAdmin,
      members: taggedMembers,
      joinRequests: (isOwner || isAdmin) ? joinRequests : [],
      invitations: (isOwner || isAdmin) ? sentInvitations : []
    };
  }

  async invite(ownerId: string, groupId: string, email?: string, phoneNumber?: string, userId?: string) {
    let targetEmail = email?.trim().toLowerCase() || null;
    let targetPhone = phoneNumber?.trim() || null;

    if (userId && userId.trim()) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId.trim() }
      });
      if (!user) {
        throw new NotFoundException(`User with ID "${userId.trim()}" not found.`);
      }
      targetEmail = user.email;
      targetPhone = user.phoneNumber;
    }

    if (!targetEmail && !targetPhone) {
      throw new BadRequestException('Provide User ID, email, or phone number to invite.');
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        owner: {
          select: { name: true, email: true }
        },
        members: {
          select: { id: true, email: true, phoneNumber: true }
        }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const isOwner = group.ownerId === ownerId;
    const admins = parseAdminIds(group.adminIds);
    const isAdmin = admins.includes(ownerId);

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Only group owners and admins can invite or add members.');
    }

    const isAlreadyMember = group.members.some(
      (m) => (userId && m.id === userId.trim()) || (targetEmail && m.email === targetEmail)
    );
    if (isAlreadyMember) {
      throw new BadRequestException('User is already a member of this group.');
    }

    // Check if invitation already exists and is pending
    const existing = await this.prisma.invitation.findFirst({
      where: {
        groupId,
        status: 'PENDING',
        OR: [
          ...(targetEmail ? [{ inviteeEmail: targetEmail }] : []),
          ...(targetPhone ? [{ inviteePhone: targetPhone }] : [])
        ]
      }
    });

    if (existing) {
      throw new BadRequestException('A pending invitation already exists for this member.');
    }

    const invitation = await this.prisma.invitation.create({
      data: {
        groupId,
        inviteeEmail: targetEmail,
        inviteePhone: targetPhone
      }
    });

    return invitation;
  }

  async findPendingInvitations(userEmail: string, userPhone: string) {
    const orConditions: any[] = [];
    if (userEmail && typeof userEmail === 'string') {
      orConditions.push({ inviteeEmail: userEmail.toLowerCase() });
    }
    if (userPhone && typeof userPhone === 'string') {
      orConditions.push({ inviteePhone: userPhone });
    }

    if (orConditions.length === 0) {
      return [];
    }

    return this.prisma.invitation.findMany({
      where: {
        status: 'PENDING',
        OR: orConditions
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
    const orConditions: any[] = [];
    if (userEmail && typeof userEmail === 'string') {
      orConditions.push({ inviteeEmail: userEmail.toLowerCase() });
    }
    if (userPhone && typeof userPhone === 'string') {
      orConditions.push({ inviteePhone: userPhone });
    }

    if (orConditions.length === 0) {
      throw new NotFoundException('Pending invitation not found or unauthorized.');
    }

    const invitation = await this.prisma.invitation.findFirst({
      where: {
        id: invitationId,
        status: 'PENDING',
        OR: orConditions
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

  /**
   * Allows a user to request joining a shared group by its unique Group ID (G...).
   * If the owner has already invited this user, it automatically accepts the invitation.
   */
  async requestToJoinGroup(userId: string, groupId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: { select: { id: true } },
        owner: { select: { id: true, name: true, email: true } }
      }
    });

    if (!group) {
      throw new NotFoundException(`Group with ID "${groupId}" not found.`);
    }

    const isAlreadyMember = group.ownerId === userId || group.members.some((m) => m.id === userId);
    if (isAlreadyMember) {
      throw new BadRequestException('You are already an owner or member of this group.');
    }

    // Check if an invitation or request already exists
    const existing = await this.prisma.invitation.findFirst({
      where: {
        groupId,
        OR: [
          { inviteeEmail: user.email.toLowerCase() },
          ...(user.phoneNumber ? [{ inviteePhone: user.phoneNumber }] : [])
        ]
      }
    });

    if (existing) {
      if (existing.status === 'PENDING') {
        // Owner had already invited the user - auto-accept and connect
        await this.prisma.$transaction([
          this.prisma.invitation.update({
            where: { id: existing.id },
            data: { status: 'ACCEPTED' }
          }),
          this.prisma.group.update({
            where: { id: groupId },
            data: {
              members: { connect: { id: userId } }
            }
          })
        ]);
        return {
          success: true,
          status: 'ACCEPTED',
          message: `You were already invited by ${group.owner.name}! You are now a member of ${group.name}.`
        };
      }

      if (existing.status === 'REQUESTED') {
        return {
          success: true,
          status: 'REQUESTED',
          message: `Join request for "${group.name}" is already pending owner approval.`
        };
      }

      // If previously declined or other, reopen as REQUESTED
      await this.prisma.invitation.update({
        where: { id: existing.id },
        data: {
          status: 'REQUESTED',
          createdAt: new Date()
        }
      });
      return {
        success: true,
        status: 'REQUESTED',
        message: `Join request sent to ${group.owner.name} (${group.name}).`
      };
    }

    await this.prisma.invitation.create({
      data: {
        groupId,
        inviteeEmail: user.email.toLowerCase(),
        inviteePhone: user.phoneNumber || null,
        status: 'REQUESTED'
      }
    });

    return {
      success: true,
      status: 'REQUESTED',
      message: `Join request sent to ${group.owner.name} for group "${group.name}" (${group.id}).`
    };
  }

  /**
   * Retrieves pending join requests for all groups managed by the specified user (as owner or admin).
   */
  async findGroupJoinRequests(callerId: string) {
    const groups = await this.prisma.group.findMany({
      where: {
        OR: [
          { ownerId: callerId },
          { members: { some: { id: callerId } } }
        ]
      },
      select: { id: true, ownerId: true, adminIds: true }
    });

    const managedGroupIds = groups
      .filter((g) => g.ownerId === callerId || parseAdminIds(g.adminIds).includes(callerId))
      .map((g) => g.id);

    if (managedGroupIds.length === 0) return [];

    return this.prisma.invitation.findMany({
      where: {
        status: 'REQUESTED',
        groupId: { in: managedGroupIds }
      },
      include: {
        group: {
          select: { id: true, name: true, ownerId: true, adminIds: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Retrieves join requests sent by the specified user that are awaiting approval.
   */
  async findUserSentJoinRequests(userEmail: string, userPhone?: string) {
    const orConditions: any[] = [];
    if (userEmail) orConditions.push({ inviteeEmail: userEmail.toLowerCase() });
    if (userPhone) orConditions.push({ inviteePhone: userPhone });
    if (orConditions.length === 0) return [];

    return this.prisma.invitation.findMany({
      where: {
        status: 'REQUESTED',
        OR: orConditions
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

  /**
   * Allows a group owner or admin to approve or decline a member's join request.
   */
  async respondToJoinRequest(callerId: string, requestId: string, accept: boolean) {
    const request = await this.prisma.invitation.findUnique({
      where: { id: requestId },
      include: { group: true }
    });

    if (!request || request.status !== 'REQUESTED') {
      throw new NotFoundException('Join request not found or has already been processed.');
    }

    const isOwner = request.group.ownerId === callerId;
    const admins = parseAdminIds(request.group.adminIds);
    const isAdmin = admins.includes(callerId);

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Only group owners and admins can respond to join requests.');
    }

    if (accept) {
      const userToJoin = await this.prisma.user.findFirst({
        where: {
          OR: [
            ...(request.inviteeEmail ? [{ email: request.inviteeEmail.toLowerCase() }] : []),
            ...(request.inviteePhone ? [{ phoneNumber: request.inviteePhone }] : [])
          ]
        }
      });

      if (userToJoin) {
        await this.prisma.$transaction([
          this.prisma.invitation.update({
            where: { id: requestId },
            data: { status: 'ACCEPTED' }
          }),
          this.prisma.group.update({
            where: { id: request.groupId },
            data: {
              members: { connect: { id: userToJoin.id } }
            }
          })
        ]);
      } else {
        await this.prisma.invitation.update({
          where: { id: requestId },
          data: { status: 'ACCEPTED' }
        });
      }

      return {
        success: true,
        status: 'ACCEPTED',
        message: 'Join request approved. User added to group members.'
      };
    } else {
      await this.prisma.invitation.update({
        where: { id: requestId },
        data: { status: 'DECLINED' }
      });

      return {
        success: true,
        status: 'DECLINED',
        message: 'Join request declined.'
      };
    }
  }

  /**
   * Allows a group owner to toggle (promote/demote) a member's admin status.
   */
  async toggleAdmin(ownerId: string, groupId: string, memberId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: { select: { id: true, name: true, email: true } } }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.ownerId !== ownerId) {
      throw new ForbiddenException('Only the group owner can promote or demote admins.');
    }

    if (memberId === ownerId) {
      throw new BadRequestException('The group owner is already the primary owner and administrator.');
    }

    const isMember = group.members.some((m) => m.id === memberId);
    if (!isMember) {
      throw new BadRequestException('User must be an existing group member before becoming an admin.');
    }

    const admins = new Set(parseAdminIds(group.adminIds));
    let isNowAdmin = false;
    if (admins.has(memberId)) {
      admins.delete(memberId);
      isNowAdmin = false;
    } else {
      admins.add(memberId);
      isNowAdmin = true;
    }

    const updated = await this.prisma.group.update({
      where: { id: groupId },
      data: {
        adminIds: JSON.stringify(Array.from(admins))
      },
      include: {
        owner: { select: { id: true, name: true, email: true, phoneNumber: true } },
        members: { select: { id: true, name: true, email: true, phoneNumber: true } },
        invitations: true
      }
    });

    return {
      success: true,
      isNowAdmin,
      adminIds: updated.adminIds,
      message: isNowAdmin ? 'Member promoted to Group Admin.' : 'Member demoted from Group Admin.'
    };
  }
}

