import { Injectable, OnModuleInit, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { generateNumericUuidV7, deriveDeterministicTrackingId } from '../common/utils/uuid7.util';

export type SafeUser = Pick<User, 'id' | 'name' | 'email' | 'phoneNumber' | 'createdAt'> & {
  twoFactorEnabled?: boolean;
};

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureAllUsersHaveNumericUuidV7();
  }

  /**
   * Ensures that all existing and future users in the database have a 10-digit numeric UUIDv7 ID.
   * If any legacy non-10-digit ID is encountered, it seamlessly updates the user ID and
   * all related foreign key references (Expenses, Groups, Tags, Investments).
   */
  async ensureAllUsersHaveNumericUuidV7() {
    try {
      const users = await this.prisma.user.findMany({ select: { id: true, email: true, name: true } });
      const nonTenDigitUsers = users.filter((u) => !/^\d{10}$/.test(u.id));

      if (nonTenDigitUsers.length > 0) {
        console.log(`[UsersService] Found ${nonTenDigitUsers.length} user(s) with non-10-digit IDs. Migrating to 10-digit numeric UUIDv7...`);
        for (const user of nonTenDigitUsers) {
          const oldId = user.id;
          let newId = generateNumericUuidV7(10);
          let exists = await this.prisma.user.findUnique({ where: { id: newId } });
          while (exists) {
            newId = generateNumericUuidV7(10);
            exists = await this.prisma.user.findUnique({ where: { id: newId } });
          }

          await this.prisma.$transaction(async (tx) => {
            try { await tx.$executeRawUnsafe('PRAGMA defer_foreign_keys = ON;'); } catch {}
            try { await tx.$executeRawUnsafe('PRAGMA foreign_keys = OFF;'); } catch {}
            await tx.$executeRawUnsafe('UPDATE "User" SET id = ? WHERE id = ?;', newId, oldId);
            await tx.$executeRawUnsafe('UPDATE "Expense" SET userId = ? WHERE userId = ?;', newId, oldId);
            await tx.$executeRawUnsafe('UPDATE "Expense" SET toUserId = ? WHERE toUserId = ?;', newId, oldId);
            await tx.$executeRawUnsafe('UPDATE "Group" SET ownerId = ? WHERE ownerId = ?;', newId, oldId);
            try {
              await tx.$executeRawUnsafe('UPDATE "_GroupMembers" SET B = ? WHERE B = ?;', newId, oldId);
            } catch {}
            await tx.$executeRawUnsafe('UPDATE "Tag" SET userId = ? WHERE userId = ?;', newId, oldId);
            await tx.$executeRawUnsafe('UPDATE "Investment" SET userId = ? WHERE userId = ?;', newId, oldId);
            try { await tx.$executeRawUnsafe('PRAGMA foreign_keys = ON;'); } catch {}
            try { await tx.$executeRawUnsafe('PRAGMA defer_foreign_keys = OFF;'); } catch {}
          });
          console.log(`[UsersService] Migrated user "${user.name}" (${user.email}): ${oldId} -> ${newId} (10 digits)`);
        }
      }
    } catch (err) {
      console.warn('[UsersService] Automatic UUIDv7 check notice:', err instanceof Error ? err.message : err);
    }
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByPhoneNumber(phoneNumber: string) {
    return this.prisma.user.findUnique({ where: { phoneNumber } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async createUser(data: { name: string; email: string; phoneNumber: string; passwordHash: string }) {
    let id = generateNumericUuidV7(10);
    let existing = await this.findById(id);
    while (existing) {
      id = generateNumericUuidV7(10);
      existing = await this.findById(id);
    }

    return this.prisma.user.create({
      data: {
        id,
        ...data
      },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        createdAt: true
      }
    });
  }

  async findAll(): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        createdAt: true
      }
    });
  }

  toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt,
      twoFactorEnabled: Boolean(user.twoFactorEnabled)
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password does not match.');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters long for maximum security.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    return {
      success: true,
      message: 'Password changed successfully.'
    };
  }

  /**
   * Exports full account data for the specified user, including all transactions,
   * investments, orders, groups, tags, and export metadata (timestamp, unique export ID).
   */
  async exportAccountData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const rawTransactions = await this.prisma.expense.findMany({
      where: {
        OR: [
          { userId },
          { toUserId: userId }
        ]
      },
      orderBy: { date: 'desc' }
    });

    const expenseIds = rawTransactions.map((e) => e.id);
    const tagsByExpenseId = new Map<string, any[]>();
    for (const id of expenseIds) tagsByExpenseId.set(id, []);

    for (let i = 0; i < expenseIds.length; i += 50) {
      const chunk = expenseIds.slice(i, i + 50);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT et."A" AS expenseId, t.*
         FROM "_ExpenseToTag" et
         JOIN "Tag" t ON et."B" = t."id"
         WHERE et."A" IN (${placeholders})`,
        ...chunk
      );
      for (const row of rows) {
        const expId = row.expenseId || row.expenseid || row.A;
        if (expId) {
          tagsByExpenseId.get(expId)?.push({
            id: row.id || row.ID,
            name: row.name || row.NAME,
            userId: row.userId || row.userid
          });
        }
      }
    }

    const transactions = rawTransactions.map((t) => ({
      ...t,
      tags: tagsByExpenseId.get(t.id) || []
    }));

    const [investments, investmentTransactions, groups, tags] = await Promise.all([
      this.prisma.investment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.investmentTransaction.findMany({
        where: { userId },
        orderBy: { date: 'desc' }
      }),
      this.prisma.group.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { id: userId } } }
          ]
        },
        include: {
          members: {
            select: { id: true, name: true, email: true, phoneNumber: true }
          },
          invitations: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.tag.findMany({
        where: { userId },
        select: { id: true, name: true }
      })
    ]);

    const timestamp = new Date().toISOString();
    const datePart = timestamp.replace(/[-:T.]/g, '').slice(0, 14);
    const randPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const exportId = `EXP-${datePart}-${randPart}`;

    return {
      version: '1.0',
      exportId,
      exportedAt: timestamp,
      appName: 'CashFlow',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt
      },
      summary: {
        totalTransactions: transactions.length,
        totalInvestments: investments.length,
        totalInvestmentTransactions: investmentTransactions.length,
        totalGroups: groups.length,
        totalTags: tags.length
      },
      data: {
        transactions: transactions.map((t) => ({
          id: t.id,
          amount: t.amount,
          category: t.category,
          description: t.description,
          paymentMethod: t.paymentMethod,
          date: t.date,
          createdAt: t.createdAt,
          transactionType: t.transactionType,
          userId: t.userId,
          toUserId: t.toUserId,
          categoryType: t.categoryType,
          tags: t.tags.map((tag) => tag.name)
        })),
        investments: investments.map((inv) => ({
          id: inv.id,
          code: inv.code,
          name: inv.name,
          type: inv.type,
          units: inv.units,
          buyPrice: inv.buyPrice,
          currentPrice: inv.currentPrice,
          color: inv.color,
          date: inv.date,
          userId: inv.userId,
          createdAt: inv.createdAt,
          updatedAt: inv.updatedAt
        })),
        investmentTransactions: investmentTransactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          units: tx.units,
          price: tx.price,
          amount: tx.amount,
          date: tx.date,
          investmentId: tx.investmentId,
          userId: tx.userId,
          createdAt: tx.createdAt
        })),
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          ownerId: g.ownerId,
          isOwner: g.ownerId === userId,
          createdAt: g.createdAt,
          members: g.members,
          invitations: g.invitations
        })),
        tags: tags.map((tg) => ({
          id: tg.id,
          name: tg.name
        }))
      }
    };
  }

  /**
   * Imports account backup data. Uses unique IDs across transactions, investments,
   * investment orders, groups, and tags to eliminate any possibility of duplicate entries.
   * If a record already exists, it is merged and updated. If new, it is inserted with its ID.
   */
  async importAccountData(userId: string, payload: any) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid backup payload: expected a JSON object.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const data = payload.data || payload;
    const exportId = payload.exportId || 'MANUAL-IMPORT';
    const exportedAt = payload.exportedAt || null;

    const exporterId = payload.user?.id || (Array.isArray(data.transactions) && data.transactions[0]?.userId) || null;
    const isSelfRestore = Boolean(exporterId && exporterId === userId);

    const stats = {
      transactions: { total: 0, created: 0, updated: 0, skipped: 0 },
      investments: { total: 0, created: 0, updated: 0, skipped: 0 },
      investmentTransactions: { total: 0, created: 0, updated: 0, skipped: 0 },
      groups: { total: 0, created: 0, updated: 0, skipped: 0 },
      tags: { total: 0, created: 0, updated: 0, skipped: 0 }
    };

    // 1. Tags
    if (Array.isArray(data.tags)) {
      stats.tags.total = data.tags.length;
      for (const t of data.tags) {
        const tagName = typeof t === 'string' ? t.trim() : (t.name || '').trim();
        if (!tagName) continue;
        const existingTag = await this.prisma.tag.findUnique({
          where: { name_userId: { name: tagName, userId } }
        });
        if (!existingTag) {
          await this.prisma.tag.create({
            data: { name: tagName, userId }
          }).catch(() => {});
          stats.tags.created++;
        } else {
          stats.tags.skipped++;
        }
      }
    }

    // Map to translate original investment IDs to target investment IDs for this user
    const assetIdMap = new Map<string, string>();

    // 2. Investments
    if (Array.isArray(data.investments)) {
      stats.investments.total = data.investments.length;
      for (const inv of data.investments) {
        if (!inv.id) continue;

        let targetInvId = inv.id;
        const existingInvWithOriginalId = await this.prisma.investment.findUnique({
          where: { id: inv.id }
        });

        // If the ID belongs to another user in DB, or this is a different user importing:
        // derive a deterministic tracking ID unique to this user!
        if (
          (existingInvWithOriginalId && existingInvWithOriginalId.userId !== userId) ||
          (!isSelfRestore && (!existingInvWithOriginalId || existingInvWithOriginalId.userId !== userId))
        ) {
          targetInvId = deriveDeterministicTrackingId(inv.id, 'ASSET', userId);
        }

        assetIdMap.set(inv.id, targetInvId);

        const existingInv = await this.prisma.investment.findUnique({
          where: { id: targetInvId }
        });

        if (existingInv) {
          if (existingInv.userId === userId) {
            await this.prisma.investment.update({
              where: { id: targetInvId },
              data: {
                code: inv.code ?? existingInv.code,
                name: inv.name ?? existingInv.name,
                type: inv.type ?? existingInv.type,
                units: inv.units !== undefined ? Number(inv.units) : existingInv.units,
                buyPrice: inv.buyPrice !== undefined ? Number(inv.buyPrice) : existingInv.buyPrice,
                currentPrice: inv.currentPrice !== undefined ? Number(inv.currentPrice) : existingInv.currentPrice,
                color: inv.color ?? existingInv.color,
                date: inv.date ? new Date(inv.date) : existingInv.date
              }
            }).catch(() => {});
            stats.investments.updated++;
          } else {
            stats.investments.skipped++;
          }
        } else {
          await this.prisma.investment.create({
            data: {
              id: targetInvId,
              code: inv.code || 'UNKNOWN',
              name: inv.name || 'Unnamed Asset',
              type: inv.type || 'Stock',
              units: Number(inv.units || 0),
              buyPrice: Number(inv.buyPrice || 0),
              currentPrice: Number(inv.currentPrice ?? inv.buyPrice ?? 0),
              color: inv.color || '#3b82f6',
              date: inv.date ? new Date(inv.date) : new Date(),
              userId,
              createdAt: inv.createdAt ? new Date(inv.createdAt) : new Date()
            }
          }).catch(() => {});
          stats.investments.created++;
        }
      }
    }

    // 3. Investment Transactions
    if (Array.isArray(data.investmentTransactions)) {
      stats.investmentTransactions.total = data.investmentTransactions.length;
      for (const tx of data.investmentTransactions) {
        if (!tx.id || !tx.investmentId) continue;

        const targetParentInvId = assetIdMap.get(tx.investmentId) || tx.investmentId;
        const parentInv = await this.prisma.investment.findUnique({
          where: { id: targetParentInvId }
        });
        if (!parentInv || parentInv.userId !== userId) continue;

        let targetTxId = tx.id;
        const existingTxWithOriginalId = await this.prisma.investmentTransaction.findUnique({
          where: { id: tx.id }
        });

        if (
          (existingTxWithOriginalId && existingTxWithOriginalId.userId !== userId) ||
          (!isSelfRestore && (!existingTxWithOriginalId || existingTxWithOriginalId.userId !== userId))
        ) {
          targetTxId = deriveDeterministicTrackingId(tx.id, tx.type || 'BUY', userId);
        }

        const existingTx = await this.prisma.investmentTransaction.findUnique({
          where: { id: targetTxId }
        });

        if (existingTx) {
          if (existingTx.userId === userId) {
            await this.prisma.investmentTransaction.update({
              where: { id: targetTxId },
              data: {
                type: tx.type ?? existingTx.type,
                units: tx.units !== undefined ? Number(tx.units) : existingTx.units,
                price: tx.price !== undefined ? Number(tx.price) : existingTx.price,
                amount: tx.amount !== undefined ? Number(tx.amount) : existingTx.amount,
                date: tx.date ? new Date(tx.date) : existingTx.date
              }
            }).catch(() => {});
            stats.investmentTransactions.updated++;
          } else {
            stats.investmentTransactions.skipped++;
          }
        } else {
          await this.prisma.investmentTransaction.create({
            data: {
              id: targetTxId,
              type: tx.type || 'BUY',
              units: Number(tx.units || 0),
              price: Number(tx.price || 0),
              amount: Number(tx.amount || 0),
              date: tx.date ? new Date(tx.date) : new Date(),
              investmentId: targetParentInvId,
              userId,
              createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date()
            }
          }).catch(() => {});
          stats.investmentTransactions.created++;
        }
      }
    }

    // 4. Groups
    const externalGroups: any[] = [];
    if (Array.isArray(data.groups)) {
      stats.groups.total = data.groups.length;
      for (const grp of data.groups) {
        if (!grp.id) continue;

        // Verify if importing user was actually the owner or a listed member in the backup
        const isOwnerInBackup = grp.ownerId === userId;
        const isMemberInBackup = Array.isArray(grp.members) && grp.members.some((m: any) => m.id === userId);
        const isAuthorizedMember = isOwnerInBackup || isMemberInBackup;

        const existingGroup = await this.prisma.group.findUnique({
          where: { id: grp.id },
          include: {
            members: { select: { id: true, name: true, email: true } },
            owner: { select: { id: true, name: true, email: true } }
          }
        });

        if (existingGroup) {
          if (isAuthorizedMember) {
            // Legit owner or member restoring backup
            await this.prisma.group.update({
              where: { id: grp.id },
              data: {
                name: grp.name ?? existingGroup.name,
                members: {
                  connect: { id: userId }
                }
              }
            }).catch(() => {});
            stats.groups.updated++;
          } else {
            // Different user importing data: do NOT add them as member automatically!
            const alreadyInGroup = existingGroup.ownerId === userId || existingGroup.members.some((m) => m.id === userId);
            if (!alreadyInGroup) {
              externalGroups.push({
                id: existingGroup.id,
                name: existingGroup.name,
                ownerId: existingGroup.ownerId,
                ownerName: existingGroup.owner?.name || 'Group Owner',
                memberCount: existingGroup.members.length,
                isMember: false,
                canRequestJoin: true
              });
            }
            stats.groups.skipped = (stats.groups.skipped || 0) + 1;
          }
        } else {
          // Group does not exist in DB yet
          if (isAuthorizedMember) {
            await this.prisma.group.create({
              data: {
                id: grp.id,
                name: grp.name || 'Shared Group',
                ownerId: isOwnerInBackup ? userId : grp.ownerId,
                createdAt: grp.createdAt ? new Date(grp.createdAt) : new Date(),
                members: {
                  connect: { id: userId }
                }
              }
            }).catch(() => {});
            stats.groups.created++;
          } else {
            // Different user: do NOT add user as member!
            const targetOwnerId = grp.ownerId;
            const ownerExists = targetOwnerId ? await this.prisma.user.findUnique({ where: { id: targetOwnerId } }) : null;
            if (ownerExists) {
              await this.prisma.group.create({
                data: {
                  id: grp.id,
                  name: grp.name || 'Shared Group',
                  ownerId: targetOwnerId,
                  createdAt: grp.createdAt ? new Date(grp.createdAt) : new Date(),
                  members: {
                    connect: { id: targetOwnerId }
                  }
                }
              }).catch(() => {});
            }

            externalGroups.push({
              id: grp.id,
              name: grp.name || 'Shared Group',
              ownerId: grp.ownerId,
              ownerName: grp.owner?.name || 'Group Owner',
              memberCount: Array.isArray(grp.members) ? grp.members.length : 1,
              isMember: false,
              canRequestJoin: true
            });
            stats.groups.skipped = (stats.groups.skipped || 0) + 1;
          }
        }

        // Link other members if legitimate owner/member
        if (isAuthorizedMember && Array.isArray(grp.members)) {
          for (const m of grp.members) {
            if (m.id && m.id !== userId) {
              const userExists = await this.prisma.user.findUnique({ where: { id: m.id } });
              if (userExists) {
                await this.prisma.group.update({
                  where: { id: grp.id },
                  data: {
                    members: { connect: { id: m.id } }
                  }
                }).catch(() => {});
              }
            }
          }
        }

        // Invitations
        if (Array.isArray(grp.invitations)) {
          for (const inv of grp.invitations) {
            if (inv.id) {
              const existingInv = await this.prisma.invitation.findUnique({ where: { id: inv.id } });
              if (!existingInv) {
                await this.prisma.invitation.create({
                  data: {
                    id: inv.id,
                    groupId: grp.id,
                    inviteeEmail: inv.inviteeEmail || null,
                    inviteePhone: inv.inviteePhone || null,
                    status: inv.status || 'PENDING',
                    createdAt: inv.createdAt ? new Date(inv.createdAt) : new Date()
                  }
                }).catch(() => {});
              }
            }
          }
        }
      }
    }

    // 5. Transactions (Expenses, Income, Transfers)
    if (Array.isArray(data.transactions)) {
      stats.transactions.total = data.transactions.length;
      for (const exp of data.transactions) {
        if (!exp.id) continue;

        // Resolve tags for this user
        const tagNames: string[] = Array.isArray(exp.tags)
          ? exp.tags.map((t: any) => typeof t === 'string' ? t.trim() : (t.name || '').trim()).filter(Boolean)
          : [];

        const tagConnects: { id: string }[] = [];
        for (const tName of tagNames) {
          let tagRecord = await this.prisma.tag.findUnique({
            where: { name_userId: { name: tName, userId } }
          });
          if (!tagRecord) {
            try {
              tagRecord = await this.prisma.tag.create({
                data: { name: tName, userId }
              });
            } catch {
              tagRecord = await this.prisma.tag.findUnique({
                where: { name_userId: { name: tName, userId } }
              });
            }
          }
          if (tagRecord) {
            tagConnects.push({ id: tagRecord.id });
          }
        }

        // Resolve valid toUserId for transfers
        let validToUserId: string | null = null;
        if (exp.toUserId) {
          const toUserExists = await this.prisma.user.findUnique({ where: { id: exp.toUserId } });
          if (toUserExists && toUserExists.id !== userId) {
            validToUserId = exp.toUserId;
          }
        }

        let targetExpId = exp.id;
        const existingExpWithOriginalId = await this.prisma.expense.findUnique({
          where: { id: exp.id }
        });

        if (
          (existingExpWithOriginalId && existingExpWithOriginalId.userId !== userId) ||
          (!isSelfRestore && (!existingExpWithOriginalId || existingExpWithOriginalId.userId !== userId))
        ) {
          targetExpId = deriveDeterministicTrackingId(exp.id, exp.transactionType, userId);
        }

        const existingExpense = await this.prisma.expense.findUnique({
          where: { id: targetExpId }
        });

        if (existingExpense) {
          if (existingExpense.userId === userId) {
            await this.prisma.expense.update({
              where: { id: targetExpId },
              data: {
                amount: exp.amount !== undefined ? Number(exp.amount) : existingExpense.amount,
                category: exp.category ?? existingExpense.category,
                description: exp.description ?? existingExpense.description,
                paymentMethod: exp.paymentMethod ?? existingExpense.paymentMethod,
                date: exp.date ? new Date(exp.date) : existingExpense.date,
                transactionType: exp.transactionType ?? existingExpense.transactionType,
                categoryType: exp.categoryType ?? existingExpense.categoryType,
                toUserId: validToUserId !== null ? validToUserId : existingExpense.toUserId,
                tags: {
                  set: tagConnects
                }
              }
            }).catch((err) => {
              console.error(`Failed to update expense ${targetExpId}:`, err);
            });
            stats.transactions.updated++;
          } else {
            stats.transactions.skipped++;
          }
        } else {
          await this.prisma.expense.create({
            data: {
              id: targetExpId,
              amount: Number(exp.amount || 0),
              category: exp.category || 'Other',
              description: exp.description || null,
              paymentMethod: exp.paymentMethod || 'Card',
              date: exp.date ? new Date(exp.date) : new Date(),
              transactionType: exp.transactionType || 'EXPENSE',
              userId,
              toUserId: validToUserId,
              categoryType: exp.categoryType || null,
              createdAt: exp.createdAt ? new Date(exp.createdAt) : new Date(),
              tags: {
                connect: tagConnects
              }
            }
          }).catch((err) => {
            console.error(`Failed to create expense ${targetExpId}:`, err);
          });
          stats.transactions.created++;
        }
      }
    }

    return {
      success: true,
      exportId,
      exportedAt,
      importedAt: new Date().toISOString(),
      stats,
      externalGroups,
      message: `Account data import completed without duplicates. Processed: ${stats.transactions.created} new & ${stats.transactions.updated} updated transactions; ${stats.investments.created} new & ${stats.investments.updated} updated investments; ${stats.groups.created} new & ${stats.groups.updated} updated groups.`
    };
  }
}
