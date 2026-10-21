import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CreateExpensesBulkDto } from './dto/bulk-create-expense.dto';
import { generateTransactionTrackingId } from '../common/utils/uuid7.util';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string, filters: { category?: string; tag?: string; from?: string; to?: string; categoryType?: string }) {
    const where: Prisma.ExpenseWhereInput = {
      OR: [
        { userId },
        { toUserId: userId }
      ],
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.categoryType ? { categoryType: filters.categoryType } : {}),
      ...(filters.tag
        ? {
            tags: {
              some: {
                name: {
                  equals: filters.tag
                }
              }
            }
          }
        : {}),
      ...(filters.from || filters.to
        ? {
            date: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {})
            }
          }
        : {})
    };

    return this.prisma.expense.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        toUser: {
          select: { id: true, name: true, email: true }
        },
        tags: {
          select: { id: true, name: true }
        }
      },
      orderBy: { date: 'desc' }
    });
  }

  private async validateTransfer(userId: string, toUserId?: string | null) {
    if (!toUserId) {
      throw new BadRequestException('Recipient user ID is required for transfers.');
    }
    if (userId === toUserId) {
      throw new BadRequestException('Sender and recipient must be different users.');
    }

    // Check if they share a common group
    const commonGroup = await this.prisma.group.findFirst({
      where: {
        AND: [
          {
            OR: [
              { ownerId: userId },
              { members: { some: { id: userId } } }
            ]
          },
          {
            OR: [
              { ownerId: toUserId },
              { members: { some: { id: toUserId } } }
            ]
          }
        ]
      }
    });

    if (!commonGroup) {
      throw new BadRequestException('You can only transfer money to users who share at least one common group with you.');
    }
  }

  async create(userId: string, dto: CreateExpenseDto) {
    if (dto.transactionType === 'TRANSFER') {
      await this.validateTransfer(userId, dto.toUserId);
    }

    const uniqueTags = dto.tags ? Array.from(new Set(dto.tags.map((t) => t.trim()).filter(Boolean))) : [];
    const tagConnectOrCreate = uniqueTags.map((tag) => ({
      where: { name_userId: { name: tag, userId } },
      create: { name: tag, userId }
    }));

    let id = generateTransactionTrackingId(dto.transactionType);
    while (await this.prisma.expense.findUnique({ where: { id } })) {
      id = generateTransactionTrackingId(dto.transactionType);
    }

    return this.prisma.expense.create({
      data: {
        id,
        userId,
        amount: dto.amount,
        category: dto.category?.trim() || null,
        description: dto.description?.trim() || null,
        paymentMethod: dto.paymentMethod?.trim() || 'Card',
        date: new Date(dto.date),
        transactionType: dto.transactionType || 'EXPENSE',
        toUserId: dto.toUserId || null,
        categoryType: dto.categoryType || null,
        tags: {
          connectOrCreate: tagConnectOrCreate
        }
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        toUser: {
          select: { id: true, name: true, email: true }
        },
        tags: {
          select: { id: true, name: true }
        }
      }
    });
  }

  async createBulk(userId: string, dto: CreateExpensesBulkDto) {
    for (const expenseDto of dto.expenses) {
      if (expenseDto.transactionType === 'TRANSFER') {
        await this.validateTransfer(userId, expenseDto.toUserId);
      }
    }

    const createdIds = new Set<string>();

    return this.prisma.$transaction(
      dto.expenses.map((expenseDto) => {
        const uniqueTags = expenseDto.tags ? Array.from(new Set(expenseDto.tags.map((t) => t.trim()).filter(Boolean))) : [];
        const tagConnectOrCreate = uniqueTags.map((tag) => ({
          where: { name_userId: { name: tag, userId } },
          create: { name: tag, userId }
        }));

        let id = generateTransactionTrackingId(expenseDto.transactionType);
        while (createdIds.has(id)) {
          id = generateTransactionTrackingId(expenseDto.transactionType);
        }
        createdIds.add(id);

        return this.prisma.expense.create({
          data: {
            id,
            userId,
            amount: expenseDto.amount,
            category: expenseDto.category?.trim() || null,
            description: expenseDto.description?.trim() || null,
            paymentMethod: expenseDto.paymentMethod?.trim() || 'Card',
            date: new Date(expenseDto.date),
            transactionType: expenseDto.transactionType || 'EXPENSE',
            toUserId: expenseDto.toUserId || null,
            categoryType: expenseDto.categoryType || null,
            tags: {
              connectOrCreate: tagConnectOrCreate
            }
          },
          include: {
            user: {
              select: { id: true, name: true, email: true }
            },
            toUser: {
              select: { id: true, name: true, email: true }
            },
            tags: {
              select: { id: true, name: true }
            }
          }
        });
      })
    );
  }

  async update(userId: string, expenseId: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, userId }
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    let tagsUpdate = undefined;
    if (dto.tags !== undefined) {
      const uniqueTags = Array.from(new Set(dto.tags.map((t) => t.trim()).filter(Boolean)));
      tagsUpdate = {
        set: [],
        connectOrCreate: uniqueTags.map((tag) => ({
          where: { name_userId: { name: tag, userId } },
          create: { name: tag, userId }
        }))
      };
    }

    return this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        category: dto.category !== undefined ? (dto.category?.trim() || null) : undefined,
        description: dto.description !== undefined ? (dto.description?.trim() || null) : undefined,
        paymentMethod: dto.paymentMethod !== undefined ? (dto.paymentMethod?.trim() || 'Card') : undefined,
        ...(dto.date ? { date: new Date(dto.date) } : {}),
        ...(dto.transactionType !== undefined ? { transactionType: dto.transactionType } : {}),
        toUserId: dto.toUserId !== undefined ? (dto.toUserId || null) : undefined,
        categoryType: dto.categoryType !== undefined ? (dto.categoryType || null) : undefined,
        ...(tagsUpdate ? { tags: tagsUpdate } : {})
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        toUser: {
          select: { id: true, name: true, email: true }
        },
        tags: {
          select: { id: true, name: true }
        }
      }
    });
  }

  async remove(userId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, userId }
    });

    if (!expense) {
      const invTx = await this.prisma.investmentTransaction.findFirst({
        where: { id: expenseId, userId }
      });
      if (invTx) {
        // Delete ONLY the transaction, NOT the asset!
        await this.prisma.investmentTransaction.delete({ where: { id: expenseId } });

        // Recalculate investment holding values with remaining transactions
        const remainingTxs = await this.prisma.investmentTransaction.findMany({
          where: { investmentId: invTx.investmentId },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
        });
        let units = 0;
        let buyPrice = 0;
        for (const tx of remainingTxs) {
          if (tx.type === 'BUY') {
            const cost = units * buyPrice + tx.units * tx.price;
            units = units + tx.units;
            buyPrice = units > 0 ? cost / units : tx.price;
          } else if (tx.type === 'SELL') {
            units = Math.max(0, units - tx.units);
            if (units === 0) buyPrice = 0;
          }
        }
        units = Math.round(units * 1e6) / 1e6;
        buyPrice = Math.round(buyPrice * 1e4) / 1e4;

        await this.prisma.investment.update({
          where: { id: invTx.investmentId },
          data: {
            units,
            buyPrice,
            ...(remainingTxs.length > 0 ? { date: remainingTxs[0].date } : {})
          }
        });
        return { deleted: true };
      }

      throw new NotFoundException('Expense not found');
    }

    await this.prisma.expense.delete({ where: { id: expenseId } });

    return { deleted: true };
  }
}
