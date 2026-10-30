import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CreateExpensesBulkDto } from './dto/bulk-create-expense.dto';
import { generateTransactionTrackingId, deriveDeterministicTrackingId } from '../common/utils/uuid7.util';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    userId: string,
    filters: {
      category?: string;
      tag?: string;
      from?: string;
      to?: string;
      categoryType?: string;
      page?: number;
      limit?: number;
      skip?: number;
      take?: number;
    }
  ) {
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

    const take = filters.take ?? (filters.limit ? Number(filters.limit) : undefined);
    const skip =
      filters.skip ??
      (filters.page && filters.limit
        ? (Number(filters.page) - 1) * Number(filters.limit)
        : undefined);

    // Query matching expenses without eager unbatched relations
    // where clause uses <= 7 bound parameters, safe against any D1 parameter limit
    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      ...(take !== undefined ? { take } : {}),
      ...(skip !== undefined ? { skip } : {})
    });

    if (expenses.length === 0) {
      return [];
    }

    // 1. Load users (user and toUser) in bounded batches of at most 50 IDs (<= 50 SQL parameters)
    const distinctUserIds = Array.from(
      new Set(
        expenses
          .flatMap((e) => [e.userId, e.toUserId])
          .filter((id): id is string => Boolean(id))
      )
    );

    const userMap = new Map<string, { id: string; name: string; email: string }>();
    const USER_BATCH_SIZE = 50;
    for (let i = 0; i < distinctUserIds.length; i += USER_BATCH_SIZE) {
      const chunk = distinctUserIds.slice(i, i + USER_BATCH_SIZE);
      const users = await this.prisma.user.findMany({
        where: { id: { in: chunk } },
        select: { id: true, name: true, email: true }
      });
      for (const u of users) {
        userMap.set(u.id, u);
      }
    }

    // 2. Load tags in bounded batches of at most 50 expense IDs (<= 50 SQL parameters)
    const expenseIds = expenses.map((e) => e.id);
    const tagsByExpenseId = new Map<string, { id: string; name: string }[]>();
    for (const id of expenseIds) {
      tagsByExpenseId.set(id, []);
    }

    const TAG_BATCH_SIZE = 50;
    for (let i = 0; i < expenseIds.length; i += TAG_BATCH_SIZE) {
      const chunk = expenseIds.slice(i, i + TAG_BATCH_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ expenseId?: string; expenseid?: string; A?: string; id: string; name: string }>
      >(
        `SELECT et."A" AS expenseId, t."id" AS id, t."name" AS name
         FROM "_ExpenseToTag" et
         JOIN "Tag" t ON et."B" = t."id"
         WHERE et."A" IN (${placeholders})`,
        ...chunk
      );

      for (const row of rows) {
        const expId = (row as any).expenseId || (row as any).expenseid || (row as any).A;
        if (expId) {
          const list = tagsByExpenseId.get(expId);
          if (list) {
            list.push({
              id: (row as any).id || (row as any).ID,
              name: (row as any).name || (row as any).NAME
            });
          }
        }
      }
    }

    // 3. Assemble and return full expense records with relations
    return expenses.map((expense) => ({
      ...expense,
      user: userMap.get(expense.userId) || { id: expense.userId, name: '', email: '' },
      toUser: expense.toUserId ? (userMap.get(expense.toUserId) || null) : null,
      tags: tagsByExpenseId.get(expense.id) || []
    }));
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

    const isReceivable = Boolean(dto.isReceivable || dto.transactionType === 'RECEIVABLE');
    const transactionType = dto.transactionType === 'RECEIVABLE' ? 'EXPENSE' : (dto.transactionType || 'EXPENSE');

    let id = generateTransactionTrackingId(isReceivable ? 'RECEIVABLE' : transactionType);
    while (await this.prisma.expense.findUnique({ where: { id } })) {
      id = generateTransactionTrackingId(isReceivable ? 'RECEIVABLE' : transactionType);
    }

    return this.prisma.expense.create({
      data: {
        id,
        userId,
        amount: dto.amount,
        category: dto.category?.trim() || null,
        description: dto.description?.trim() || null,
        paymentMethod: dto.paymentMethod?.trim() || 'Card',
        paymentAccount: dto.paymentAccount?.trim() || null,
        date: new Date(dto.date),
        transactionType,
        toUserId: dto.toUserId || null,
        categoryType: dto.categoryType || null,
        isReceivable,
        receivableStatus: isReceivable ? (dto.receivableStatus || 'OUTSTANDING') : null,
        reimbursedAmount: isReceivable ? (dto.reimbursedAmount ?? 0) : null,
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
    if (!dto.expenses || !Array.isArray(dto.expenses) || dto.expenses.length === 0) {
      return [];
    }

    // 1. Normalize and validate records first before performing any database writes
    const normalized: Array<{
      index: number;
      amount: number;
      category: string | null;
      description: string | null;
      paymentMethod: string;
      date: Date;
      transactionType: string;
      toUserId: string | null;
      categoryType: string | null;
      tags: string[];
    }> = [];

    for (let i = 0; i < dto.expenses.length; i++) {
      const expDto = dto.expenses[i];
      if (!expDto) {
        throw new BadRequestException(`Transaction #${i + 1} is empty or invalid.`);
      }

      const amt = Number(expDto.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new BadRequestException(
          `Transaction #${i + 1} ("${expDto.description || expDto.category || 'Untitled'}") must have a valid positive amount.`
        );
      }

      const d = new Date(expDto.date);
      if (isNaN(d.getTime())) {
        throw new BadRequestException(
          `Transaction #${i + 1} has an invalid date: "${expDto.date}".`
        );
      }

      const txType = (expDto.transactionType || 'EXPENSE').toUpperCase().trim();
      const validTypes = [
        'EXPENSE',
        'INCOME',
        'TRANSFER',
        'INVESTMENT',
        'INVESTMENT_BUY',
        'INVESTMENT_SELL',
        'BUY',
        'SELL'
      ];
      if (!validTypes.includes(txType)) {
        throw new BadRequestException(
          `Transaction #${i + 1} has an unsupported transactionType: "${expDto.transactionType}".`
        );
      }

      if (txType === 'TRANSFER') {
        await this.validateTransfer(userId, expDto.toUserId);
      }

      let categoryType = expDto.categoryType?.toUpperCase().trim() || null;
      if (categoryType && !['ESSENTIALS', 'HIGH_VALUE', 'LIFESTYLE'].includes(categoryType)) {
        categoryType = null;
      }

      const uniqueTags = expDto.tags
        ? Array.from(new Set(expDto.tags.map((t) => String(t).trim()).filter(Boolean)))
        : [];

      normalized.push({
        index: i,
        amount: Math.round(amt * 100) / 100,
        category: expDto.category?.trim() || null,
        description: expDto.description?.trim() || null,
        paymentMethod: expDto.paymentMethod?.trim() || 'Card',
        date: d,
        transactionType: txType,
        toUserId: expDto.toUserId || null,
        categoryType,
        tags: uniqueTags
      });
    }

    // 2. Idempotency: use provided importId or derive deterministic content hash
    const effectiveImportId =
      dto.importId?.trim() ||
      crypto
        .createHash('sha256')
        .update(`${userId}:${JSON.stringify(dto.expenses)}`)
        .digest('hex')
        .slice(0, 16);

    // Assign deterministic tracking IDs based on importId and index
    const assignedIds = new Set<string>();
    const recordsWithIds = normalized.map((item) => {
      let id = deriveDeterministicTrackingId(
        `${effectiveImportId}:${item.index}`,
        item.transactionType,
        userId
      );
      let attempt = 0;
      while (assignedIds.has(id)) {
        attempt++;
        id = deriveDeterministicTrackingId(
          `${effectiveImportId}:${item.index}:${attempt}`,
          item.transactionType,
          userId
        );
      }
      assignedIds.add(id);
      return { ...item, id };
    });

    const allAssignedIds = recordsWithIds.map((r) => r.id);

    // 3. Check which records already exist to ensure retry-safety and prevent duplicates
    const existingIds = new Set<string>();
    const CHECK_BATCH_SIZE = 50;
    for (let i = 0; i < allAssignedIds.length; i += CHECK_BATCH_SIZE) {
      const chunk = allAssignedIds.slice(i, i + CHECK_BATCH_SIZE);
      const existing = await this.prisma.expense.findMany({
        where: { id: { in: chunk } },
        select: { id: true }
      });
      for (const e of existing) {
        existingIds.add(e.id);
      }
    }

    // 4. Batch tag processing: collect unique tag names and ensure tags exist
    const allTagNames = Array.from(new Set(recordsWithIds.flatMap((r) => r.tags)));
    const tagMap = new Map<string, string>(); // name -> id

    for (let i = 0; i < allTagNames.length; i += 50) {
      const chunk = allTagNames.slice(i, i + 50);
      const existingTags = await this.prisma.tag.findMany({
        where: { userId, name: { in: chunk } },
        select: { id: true, name: true }
      });
      for (const t of existingTags) {
        tagMap.set(t.name, t.id);
      }
    }

    const missingTagNames = allTagNames.filter((name) => !tagMap.has(name));
    // Tag: id, name, userId -> 3 bound params. floor(98/3) = 32 tags per multi-row statement
    const TAG_INSERT_BATCH = 32;
    for (let i = 0; i < missingTagNames.length; i += TAG_INSERT_BATCH) {
      const chunk = missingTagNames.slice(i, i + TAG_INSERT_BATCH);
      const placeholders: string[] = [];
      const params: any[] = [];
      for (const name of chunk) {
        const tagId = 'tag_' + crypto.randomBytes(12).toString('hex');
        tagMap.set(name, tagId);
        placeholders.push('(?, ?, ?)');
        params.push(tagId, name, userId);
      }
      await this.prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO "Tag" ("id", "name", "userId") VALUES ${placeholders.join(', ')}`,
        ...params
      );
    }

    // Resolve any tags that might have been concurrently inserted
    const unresolved = allTagNames.filter((name) => !tagMap.has(name));
    if (unresolved.length > 0) {
      for (let i = 0; i < unresolved.length; i += 50) {
        const chunk = unresolved.slice(i, i + 50);
        const resolved = await this.prisma.tag.findMany({
          where: { userId, name: { in: chunk } },
          select: { id: true, name: true }
        });
        for (const t of resolved) {
          tagMap.set(t.name, t.id);
        }
      }
    }

    // 5. Split expense inserts into safe batches accounting for 15 bound parameters per record
    // floor(98 / 15) = 6 records per statement (90 bound params, strictly below D1 100 limit)
    const recordsToInsert = recordsWithIds.filter((r) => !existingIds.has(r.id));
    const nowIso = new Date().toISOString();
    const EXPENSE_INSERT_BATCH = 6;
    for (let i = 0; i < recordsToInsert.length; i += EXPENSE_INSERT_BATCH) {
      const chunk = recordsToInsert.slice(i, i + EXPENSE_INSERT_BATCH);
      const placeholders: string[] = [];
      const params: any[] = [];
      for (const exp of chunk) {
        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        params.push(
          exp.id,
          exp.amount,
          exp.category,
          exp.description,
          exp.paymentMethod,
          (exp as any).paymentAccount || null,
          exp.date.toISOString(),
          nowIso,
          userId,
          exp.transactionType,
          exp.toUserId,
          exp.categoryType,
          (exp as any).isReceivable ? 1 : 0,
          (exp as any).receivableStatus || null,
          (exp as any).reimbursedAmount ?? 0
        );
      }
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "Expense" ("id", "amount", "category", "description", "paymentMethod", "paymentAccount", "date", "createdAt", "userId", "transactionType", "toUserId", "categoryType", "isReceivable", "receivableStatus", "reimbursedAmount") VALUES ${placeholders.join(', ')}`,
        ...params
      );
    }

    // 6. Split tag relation writes into safe batches accounting for 2 bound parameters per pair
    // floor(98 / 2) = 49 pairs per statement (98 bound params, strictly below D1 100 limit)
    const relationPairs: Array<{ expenseId: string; tagId: string }> = [];
    for (const exp of recordsWithIds) {
      for (const tagName of exp.tags) {
        const tagId = tagMap.get(tagName);
        if (tagId) {
          relationPairs.push({ expenseId: exp.id, tagId });
        }
      }
    }

    const RELATION_INSERT_BATCH = 49;
    for (let i = 0; i < relationPairs.length; i += RELATION_INSERT_BATCH) {
      const chunk = relationPairs.slice(i, i + RELATION_INSERT_BATCH);
      const placeholders: string[] = [];
      const params: any[] = [];
      for (const pair of chunk) {
        placeholders.push('(?, ?)');
        params.push(pair.expenseId, pair.tagId);
      }
      await this.prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO "_ExpenseToTag" ("A", "B") VALUES ${placeholders.join(', ')}`,
        ...params
      );
    }

    // 7. Verify all writes before declaring success
    const verifiedIds = new Set<string>();
    for (let i = 0; i < allAssignedIds.length; i += 50) {
      const chunk = allAssignedIds.slice(i, i + 50);
      const verified = await this.prisma.expense.findMany({
        where: { id: { in: chunk } },
        select: { id: true }
      });
      for (const v of verified) {
        verifiedIds.add(v.id);
      }
    }

    if (verifiedIds.size !== allAssignedIds.length) {
      const missing = allAssignedIds.filter((id) => !verifiedIds.has(id));
      throw new Error(
        `Bulk import verification failed: ${missing.length} record(s) could not be verified in the database.`
      );
    }

    // 8. Fetch and return complete expense records with relations in original order
    const loadedExpenses: any[] = [];
    for (let i = 0; i < allAssignedIds.length; i += 50) {
      const chunk = allAssignedIds.slice(i, i + 50);
      const chunkExpenses = await this.prisma.expense.findMany({
        where: { id: { in: chunk } }
      });
      loadedExpenses.push(...chunkExpenses);
    }

    const loadedMap = new Map<string, any>(loadedExpenses.map((e) => [e.id, e]));

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true }
    });

    const recipientIds = Array.from(
      new Set(recordsWithIds.map((n) => n.toUserId).filter((id): id is string => Boolean(id)))
    );
    const recipientMap = new Map<string, { id: string; name: string; email: string }>();
    for (let i = 0; i < recipientIds.length; i += 50) {
      const chunk = recipientIds.slice(i, i + 50);
      const recipients = await this.prisma.user.findMany({
        where: { id: { in: chunk } },
        select: { id: true, name: true, email: true }
      });
      for (const r of recipients) {
        recipientMap.set(r.id, r);
      }
    }

    return recordsWithIds.map((item) => {
      const dbExp = loadedMap.get(item.id);
      const tagsList = item.tags.map((tName) => ({
        id: tagMap.get(tName) || '',
        name: tName
      }));
      return {
        ...(dbExp || {
          id: item.id,
          amount: item.amount,
          category: item.category,
          description: item.description,
          paymentMethod: item.paymentMethod,
          date: item.date,
          createdAt: new Date(nowIso),
          userId,
          transactionType: item.transactionType,
          toUserId: item.toUserId,
          categoryType: item.categoryType
        }),
        user: currentUser || { id: userId, name: '', email: '' },
        toUser: item.toUserId ? recipientMap.get(item.toUserId) || null : null,
        tags: tagsList
      };
    });
  }

  async update(userId: string, expenseId: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, userId }
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    let tagsUpdate: any = undefined;
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

    let isReceivableUpdate = dto.isReceivable;
    let transactionTypeUpdate = dto.transactionType;
    if (dto.transactionType === 'RECEIVABLE') {
      transactionTypeUpdate = 'EXPENSE';
      isReceivableUpdate = true;
    }

    return this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        category: dto.category !== undefined ? (dto.category?.trim() || null) : undefined,
        description: dto.description !== undefined ? (dto.description?.trim() || null) : undefined,
        paymentMethod: dto.paymentMethod !== undefined ? (dto.paymentMethod?.trim() || 'Card') : undefined,
        paymentAccount: dto.paymentAccount !== undefined ? (dto.paymentAccount?.trim() || null) : undefined,
        ...(dto.date ? { date: new Date(dto.date) } : {}),
        ...(transactionTypeUpdate !== undefined ? { transactionType: transactionTypeUpdate } : {}),
        toUserId: dto.toUserId !== undefined ? (dto.toUserId || null) : undefined,
        categoryType: dto.categoryType !== undefined ? (dto.categoryType || null) : undefined,
        ...(isReceivableUpdate !== undefined ? { isReceivable: isReceivableUpdate } : {}),
        ...(dto.receivableStatus !== undefined ? { receivableStatus: dto.receivableStatus } : {}),
        ...(dto.reimbursedAmount !== undefined ? { reimbursedAmount: dto.reimbursedAmount } : {}),
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
