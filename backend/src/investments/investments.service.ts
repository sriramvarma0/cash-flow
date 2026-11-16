import { Injectable, OnModuleInit, Logger, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { UpdateInvestmentTransactionDto } from './dto/update-investment-transaction.dto';
import { generateTransactionTrackingId, generateAssetTrackingId } from '../common/utils/uuid7.util';
import * as bcrypt from 'bcrypt';
import yahooFinance from 'yahoo-finance2';

const yahoo = new yahooFinance({ suppressNotices: ['yahooSurvey'] });

const assetColors = ['#0d533c', '#17a66b', '#3ecb8e', '#7fe0b5', '#a6bbbb', '#5b7676', '#3b82f6', '#f59e0b', '#ef4444'];

@Injectable()
export class InvestmentsService implements OnModuleInit {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureSchemaAndDataMigration();
  }

  /**
   * Safe, idempotent production startup migration:
   * 1. Ensures 'Asset' table exists (if not created via prisma migrate deploy).
   * 2. Ensures 'assetId' column exists on 'Investment'.
   * 3. Merges any legacy duplicates for (userId, code) if they existed previously.
   * 4. Ensures indexes exist.
   * 5. Backfills any Investment rows missing an assetId, linking them to their unified Asset record.
   * 6. Does NOT touch or break existing IDs or transactions.
   */
  async ensureSchemaAndDataMigration() {
    try {
      this.logger.log('Verifying production schema and global asset data integrity...');

      // 1. Ensure Asset table exists
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Asset" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "currentPrice" REAL NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Asset_code_key" ON "Asset"("code");
      `);

      // 2. Ensure assetId column exists on Investment
      const tableInfo: any[] = await this.prisma.$queryRawUnsafe('PRAGMA table_info("Investment");');
      const hasAssetId = Array.isArray(tableInfo) && tableInfo.some((col: any) => col.name === 'assetId');
      if (!hasAssetId) {
        this.logger.log('Adding missing "assetId" column to "Investment" table...');
        await this.prisma.$executeRawUnsafe('ALTER TABLE "Investment" ADD COLUMN "assetId" TEXT NOT NULL DEFAULT "";');
      }

      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Investment_assetId_idx" ON "Investment"("assetId");
      `);

      // 3. Resolve any historical duplicates per (userId, code) before creating unique index
      const duplicateHoldings: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT "userId", UPPER(TRIM("code")) as "code", COUNT(*) as cnt
        FROM "Investment"
        GROUP BY "userId", UPPER(TRIM("code"))
        HAVING cnt > 1;
      `);

      if (duplicateHoldings && duplicateHoldings.length > 0) {
        this.logger.warn(`Found ${duplicateHoldings.length} duplicate holding group(s) in database. Consolidating cleanly...`);
        for (const dup of duplicateHoldings) {
          const userHoldings = await this.prisma.investment.findMany({
            where: { userId: dup.userId },
            orderBy: { createdAt: 'asc' }
          });
          const matching = userHoldings.filter(h => h.code.trim().toUpperCase() === dup.code);
          if (matching.length > 1) {
            const primary = matching[0];
            const toMerge = matching.slice(1);
            for (const m of toMerge) {
              await this.prisma.investmentTransaction.updateMany({
                where: { investmentId: m.id },
                data: { investmentId: primary.id }
              });
              await this.prisma.investment.delete({
                where: { id: m.id }
              });
            }
            await this.recalculateInvestmentValues(primary.id);
            this.logger.log(`Consolidated ${toMerge.length} duplicate holding(s) for user [${dup.userId}] into primary holding [${primary.id}] (${dup.code})`);
          }
        }
      }

      // Ensure index on (userId, code)
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Investment_userId_code_idx" ON "Investment"("userId", "code");
      `);

      // 4. Backfill any Investment rows where assetId is empty or null
      const unlinkedInvestments = await this.prisma.investment.findMany({
        where: {
          OR: [
            { assetId: '' },
            { assetId: { equals: undefined as any } }
          ]
        }
      });

      if (unlinkedInvestments.length > 0) {
        this.logger.log(`Backfilling global assetId for ${unlinkedInvestments.length} unlinked investment(s)...`);
        for (const inv of unlinkedInvestments) {
          const normCode = inv.code.trim().toUpperCase();
          let globalAsset = await this.prisma.asset.findUnique({
            where: { code: normCode }
          });

          if (!globalAsset) {
            let assetId = (inv.id && /^A[0-9A-Z]{9}$/.test(inv.id)) ? inv.id : generateAssetTrackingId();
            while (await this.prisma.asset.findUnique({ where: { id: assetId } })) {
              assetId = generateAssetTrackingId();
            }
            globalAsset = await this.prisma.asset.create({
              data: {
                id: assetId,
                code: normCode,
                name: inv.name,
                type: inv.type,
                currentPrice: inv.currentPrice
              }
            });
            this.logger.log(`Created global Asset [${globalAsset.id}] for code ${normCode}`);
          }

          await this.prisma.investment.update({
            where: { id: inv.id },
            data: { assetId: globalAsset.id }
          });
        }
      }

      this.logger.log('Global asset data and schema verification completed successfully.');
    } catch (err) {
      this.logger.error('Error during automatic schema/data verification:', err);
    }
  }

  private async fetchTickerData(code: string, type: string): Promise<{ name: string; price: number; dividendYield: number; beta: number }> {
    const trimmedCode = code.trim();

    // 1. Mutual Fund API route (queries AMFI public API)
    if (type === 'Mutual Fund') {
      try {
        const response = await fetch(`https://api.mfapi.in/mf/${trimmedCode}`);
        if (response.ok) {
          const data: any = await response.json();
          if (data && data.status === 'SUCCESS') {
            const name = data.meta?.scheme_name || trimmedCode;
            const price = data.data?.[0]?.nav ? parseFloat(data.data[0].nav) : 0;
            return { name, price, dividendYield: 0, beta: 1.0 };
          }
        }
      } catch (e) {
        console.error(`Error querying AMFI API for mutual fund scheme ${trimmedCode}:`, e);
      }
      return { name: trimmedCode.toUpperCase(), price: 0, dividendYield: 0, beta: 1.0 };
    }

    // 2. Stock / ETF / Crypto / Gold API route (queries Yahoo Finance via the wrapper library)
    if (type === 'Stock' || type === 'ETF' || type === 'Crypto' || type === 'Gold' || type === 'Real Estate') {
      try {
        const quote = await yahoo.quote(trimmedCode.toUpperCase()) as any;
        if (quote) {
          const name = quote.longName || quote.shortName || quote.symbol || trimmedCode.toUpperCase();
          const price = quote.regularMarketPrice || 0;

          let dividendYield = quote.dividendYield || 0;
          if (!dividendYield && quote.trailingAnnualDividendYield) {
            dividendYield = quote.trailingAnnualDividendYield < 0.1
              ? quote.trailingAnnualDividendYield * 100
              : quote.trailingAnnualDividendYield;
          }

          const beta = quote.beta || 1.0;
          return { name, price, dividendYield, beta };
        }
      } catch (e) {
        console.error(`Error querying Yahoo Finance wrapper details for ${trimmedCode}:`, e);
      }
    }

    return { name: trimmedCode.toUpperCase(), price: 0, dividendYield: 0, beta: 1.0 };
  }

  async findAll(userId: string) {
    const investments = await this.prisma.investment.findMany({
      where: { userId },
      include: {
        asset: true,
        transactions: {
          orderBy: { date: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Refresh pricing in the database on page fetch and enrich with live quote metadata
    const refreshed = await Promise.all(
      investments.map(async (inv) => {
        const assetId = inv.assetId || inv.asset?.id || inv.id;
        try {
          const freshData = await this.fetchTickerData(inv.code, inv.type);
          const updates: any = {};
          if (freshData.price > 0 && Math.abs(freshData.price - inv.currentPrice) > 0.001) {
            updates.currentPrice = freshData.price;
            inv.currentPrice = freshData.price;
            if (assetId) {
              await this.prisma.asset.update({
                where: { id: assetId },
                data: { currentPrice: freshData.price }
              }).catch(() => {});
            }
          }
          if (freshData.name && freshData.name !== inv.code && inv.name === inv.code) {
            updates.name = freshData.name;
            inv.name = freshData.name;
            if (assetId) {
              await this.prisma.asset.update({
                where: { id: assetId },
                data: { name: freshData.name }
              }).catch(() => {});
            }
          }

          if (Object.keys(updates).length > 0) {
            await this.prisma.investment.update({
              where: { id: inv.id },
              data: updates
            });
          }

          return {
            ...inv,
            id: assetId,
            assetId,
            holdingId: inv.id,
            dividendYield: freshData.dividendYield,
            beta: freshData.beta
          };
        } catch {
          // ignore
        }
        return {
          ...inv,
          id: assetId,
          assetId,
          holdingId: inv.id,
          dividendYield: 0,
          beta: 1.0
        };
      })
    );

    return refreshed;
  }

  /**
   * Adding an asset records a BUY or SELL transaction and updates the holding quantity/price.
   * If the holding is already present for the user, it updates the quantity and buy price as per the transaction.
   * If the holding is not present and order is BUY, it automatically creates a new entry for the user.
   * The asset ID is application-wide (shared across all users holding this asset based on ticker).
   */
  async create(userId: string, dto: CreateInvestmentDto) {
    const normalizedCode = dto.code.trim().toUpperCase();

    // 1. Get or create the global application-wide Asset entry (tracked by ticker)
    let asset = await this.prisma.asset.findUnique({
      where: { code: normalizedCode }
    });

    const tickerData = await this.fetchTickerData(normalizedCode, dto.type);
    const resolvedPrice = tickerData.price > 0 ? tickerData.price : (asset?.currentPrice && asset.currentPrice > 0 ? asset.currentPrice : dto.buyPrice);
    const resolvedName = tickerData.name && tickerData.name !== normalizedCode ? tickerData.name : (asset?.name || normalizedCode);

    // Validate price
    if (!resolvedPrice || resolvedPrice <= 0) {
      throw new BadRequestException(
        `Asset code "${dto.code}" could not be resolved for class "${dto.type}". Please check the code.`
      );
    }

    if (dto.units <= 0 || dto.buyPrice <= 0) {
      throw new BadRequestException('Units and price must be greater than 0.');
    }

    if (!asset) {
      let newAssetId = generateAssetTrackingId();
      while (await this.prisma.asset.findUnique({ where: { id: newAssetId } })) {
        newAssetId = generateAssetTrackingId();
      }

      asset = await this.prisma.asset.create({
        data: {
          id: newAssetId,
          code: normalizedCode,
          name: resolvedName,
          type: dto.type,
          currentPrice: resolvedPrice
        }
      });
    } else if (tickerData.price > 0 && Math.abs(tickerData.price - asset.currentPrice) > 0.001) {
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { currentPrice: tickerData.price, ...(tickerData.name && tickerData.name !== normalizedCode ? { name: tickerData.name } : {}) }
      }).catch(() => {});
    }

    const assetId = asset.id;
    const txDate = dto.date ? new Date(dto.date) : new Date();

    // 2. Check if the user already has this asset in their portfolio
    const existingHolding = await this.prisma.investment.findFirst({
      where: {
        userId,
        OR: [
          { code: normalizedCode },
          { assetId }
        ]
      }
    });

    const txType: 'BUY' | 'SELL' = dto.transactionType === 'SELL' ? 'SELL' : 'BUY';

    // Handle SELL transaction
    if (txType === 'SELL') {
      if (!existingHolding) {
        throw new BadRequestException(
          `Cannot sell units of "${dto.code}". You do not currently hold this asset in your portfolio.`
        );
      }

      if (dto.units > existingHolding.units) {
        throw new BadRequestException(
          `Cannot sell ${dto.units} units. You currently own ${existingHolding.units} units of "${existingHolding.name}".`
        );
      }

      let txId = generateTransactionTrackingId('SELL');
      while (await this.prisma.investmentTransaction.findUnique({ where: { id: txId } })) {
        txId = generateTransactionTrackingId('SELL');
      }

      const tx = await this.prisma.investmentTransaction.create({
        data: {
          id: txId,
          type: 'SELL',
          units: dto.units,
          price: dto.buyPrice, // sell price
          amount: dto.units * dto.buyPrice,
          date: txDate,
          investmentId: existingHolding.id,
          userId
        }
      });

      // Recalculate holding units and weighted average buy price
      const updatedInvestment = await this.recalculateInvestmentValues(existingHolding.id);

      if (updatedInvestment.assetId !== assetId) {
        await this.prisma.investment.update({
          where: { id: existingHolding.id },
          data: { assetId }
        });
      }

      return {
        ...updatedInvestment,
        id: assetId,
        assetId,
        holdingId: updatedInvestment.id,
        transactions: [tx],
        dividendYield: tickerData.dividendYield,
        beta: tickerData.beta
      };
    }

    // Handle BUY transaction for existing holding
    if (existingHolding) {
      let txId = generateTransactionTrackingId('BUY');
      while (await this.prisma.investmentTransaction.findUnique({ where: { id: txId } })) {
        txId = generateTransactionTrackingId('BUY');
      }

      const tx = await this.prisma.investmentTransaction.create({
        data: {
          id: txId,
          type: 'BUY',
          units: dto.units,
          price: dto.buyPrice,
          amount: dto.units * dto.buyPrice,
          date: txDate,
          investmentId: existingHolding.id,
          userId
        }
      });

      // Recalculate holding units and weighted average buy price from all transactions
      const updatedInvestment = await this.recalculateInvestmentValues(existingHolding.id);

      // Ensure assetId is linked to global asset
      if (updatedInvestment.assetId !== assetId) {
        await this.prisma.investment.update({
          where: { id: existingHolding.id },
          data: { assetId }
        });
      }

      return {
        ...updatedInvestment,
        id: assetId,
        assetId,
        holdingId: updatedInvestment.id,
        transactions: [tx],
        dividendYield: tickerData.dividendYield,
        beta: tickerData.beta
      };
    }

    // Asset is not present: automatically create new entry for this user
    const count = await this.prisma.investment.count({ where: { userId } });
    const color = assetColors[count % assetColors.length];

    const created = await this.prisma.investment.create({
      data: {
        assetId,
        code: normalizedCode,
        name: resolvedName,
        type: dto.type,
        units: dto.units,
        buyPrice: dto.buyPrice,
        currentPrice: resolvedPrice,
        color,
        date: txDate,
        userId
      }
    });

    // Create the initial BUY transaction for this asset with PB tracking ID
    let txId = generateTransactionTrackingId('BUY');
    while (await this.prisma.investmentTransaction.findUnique({ where: { id: txId } })) {
      txId = generateTransactionTrackingId('BUY');
    }

    const initialTx = await this.prisma.investmentTransaction.create({
      data: {
        id: txId,
        type: 'BUY',
        units: dto.units,
        price: dto.buyPrice,
        amount: dto.units * dto.buyPrice,
        date: txDate,
        investmentId: created.id,
        userId
      }
    });

    return {
      ...created,
      id: assetId,
      assetId,
      holdingId: created.id,
      transactions: [initialTx],
      dividendYield: tickerData.dividendYield,
      beta: tickerData.beta
    };
  }

  async recordTransaction(
    userId: string,
    code: string,
    dto: { type: 'BUY' | 'SELL'; units: number; price: number; date?: string; type_class?: string }
  ) {
    const normalizedCode = code.trim().toUpperCase();

    let investment = await this.prisma.investment.findFirst({
      where: {
        userId,
        OR: [
          { code: normalizedCode },
          { id: code },
          { assetId: normalizedCode }
        ]
      }
    });

    if (dto.units <= 0 || dto.price <= 0) {
      throw new BadRequestException('Units and price must be greater than 0.');
    }

    // If asset holding is not present:
    if (!investment) {
      if (dto.type === 'SELL') {
        throw new BadRequestException(`Cannot sell units of "${code}". You do not currently hold this asset.`);
      }

      // If BUY and not present, automatically create new entry
      return this.create(userId, {
        code: normalizedCode,
        type: dto.type_class || 'Stock',
        units: dto.units,
        buyPrice: dto.price,
        date: dto.date,
        transactionType: 'BUY'
      });
    }

    if (dto.type === 'SELL' && dto.units > investment.units) {
      throw new BadRequestException(`Cannot sell ${dto.units} units. You currently own ${investment.units} units.`);
    }

    let txId = generateTransactionTrackingId(dto.type);
    while (await this.prisma.investmentTransaction.findUnique({ where: { id: txId } })) {
      txId = generateTransactionTrackingId(dto.type);
    }

    const date = dto.date ? new Date(dto.date) : new Date();
    const amount = dto.units * dto.price;

    const tx = await this.prisma.investmentTransaction.create({
      data: {
        id: txId,
        type: dto.type,
        units: dto.units,
        price: dto.price,
        amount,
        date,
        investmentId: investment.id,
        userId
      }
    });

    // Recalculate holding units and weighted average buy price from all transactions
    const updatedInvestment = await this.recalculateInvestmentValues(investment.id);
    const assetId = updatedInvestment.assetId || investment.assetId || updatedInvestment.id;

    return {
      transaction: tx,
      investment: {
        ...updatedInvestment,
        id: assetId,
        assetId,
        holdingId: updatedInvestment.id
      }
    };
  }

  async recalculateInvestmentValues(investmentId: string) {
    const transactions = await this.prisma.investmentTransaction.findMany({
      where: { investmentId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    });

    let units = 0;
    let buyPrice = 0;

    for (const tx of transactions) {
      if (tx.type === 'BUY') {
        const totalCost = units * buyPrice + tx.units * tx.price;
        units = units + tx.units;
        buyPrice = units > 0 ? totalCost / units : tx.price;
      } else if (tx.type === 'SELL') {
        units = Math.max(0, units - tx.units);
        if (units === 0) {
          buyPrice = 0;
        }
      }
    }

    units = Math.round(units * 1e6) / 1e6;
    buyPrice = Math.round(buyPrice * 1e4) / 1e4;

    const data: any = {
      units,
      buyPrice
    };

    if (transactions.length > 0) {
      data.date = transactions[0].date;
    }

    return this.prisma.investment.update({
      where: { id: investmentId },
      data
    });
  }

  async updateTransaction(
    userId: string,
    txId: string,
    dto: UpdateInvestmentTransactionDto
  ) {
    const tx = await this.prisma.investmentTransaction.findFirst({
      where: { id: txId, userId },
      include: { investment: true }
    });

    if (!tx) {
      throw new NotFoundException(`Investment transaction with ID "${txId}" not found.`);
    }

    const newUnits = dto.units !== undefined ? dto.units : tx.units;
    const newPrice = dto.price !== undefined ? dto.price : tx.price;
    const newType = dto.type !== undefined ? dto.type : (tx.type as 'BUY' | 'SELL');
    const newDate = dto.date ? new Date(dto.date) : tx.date;

    if (newUnits <= 0 || newPrice <= 0) {
      throw new BadRequestException('Units and price must be greater than 0.');
    }

    const newAmount = newUnits * newPrice;

    // Check if ID prefix needs updating if type changed between BUY (PB) and SELL (PS)
    let newId = tx.id;
    if (dto.type && dto.type !== tx.type) {
      if (dto.type === 'SELL' && tx.id.startsWith('PB')) {
        newId = 'PS' + tx.id.slice(2);
      } else if (dto.type === 'BUY' && tx.id.startsWith('PS')) {
        newId = 'PB' + tx.id.slice(2);
      }
    }

    let updatedTx;
    if (newId !== tx.id) {
      updatedTx = await this.prisma.investmentTransaction.update({
        where: { id: tx.id },
        data: {
          id: newId,
          type: newType,
          units: newUnits,
          price: newPrice,
          amount: newAmount,
          date: newDate
        }
      });
    } else {
      updatedTx = await this.prisma.investmentTransaction.update({
        where: { id: tx.id },
        data: {
          type: newType,
          units: newUnits,
          price: newPrice,
          amount: newAmount,
          date: newDate
        }
      });
    }

    // Recalculate investment holding values with updated transaction
    const updatedInvestment = await this.recalculateInvestmentValues(tx.investmentId);
    const assetId = updatedInvestment.assetId || tx.investment?.assetId || updatedInvestment.id;

    return {
      transaction: updatedTx,
      investment: {
        ...updatedInvestment,
        id: assetId,
        assetId,
        holdingId: updatedInvestment.id
      }
    };
  }

  async deleteTransaction(userId: string, txId: string) {
    const tx = await this.prisma.investmentTransaction.findFirst({
      where: { id: txId, userId },
      include: { investment: true }
    });

    if (!tx) {
      throw new NotFoundException(`Investment transaction with ID "${txId}" not found.`);
    }

    const investmentId = tx.investmentId;

    // IMPORTANT: Delete ONLY the transaction, NOT the asset!
    await this.prisma.investmentTransaction.delete({
      where: { id: txId }
    });

    // Recalculate investment holding values with remaining transactions
    const updatedInvestment = await this.recalculateInvestmentValues(investmentId);
    const assetId = updatedInvestment.assetId || tx.investment?.assetId || updatedInvestment.id;

    return {
      deleted: true,
      investment: {
        ...updatedInvestment,
        id: assetId,
        assetId,
        holdingId: updatedInvestment.id
      }
    };
  }

  async getTransactions(userId: string, code?: string) {
    if (code) {
      const normalizedCode = code.trim().toUpperCase();
      const investment = await this.prisma.investment.findFirst({
        where: {
          userId,
          OR: [
            { code: normalizedCode },
            { id: code },
            { assetId: normalizedCode }
          ]
        }
      });
      if (!investment) return [];
      return this.prisma.investmentTransaction.findMany({
        where: { userId, investmentId: investment.id },
        include: { investment: true },
        orderBy: { date: 'desc' }
      });
    }

    return this.prisma.investmentTransaction.findMany({
      where: { userId },
      include: { investment: true },
      orderBy: { date: 'desc' }
    });
  }

  async deleteAsset(userId: string, code: string, password?: string) {
    if (!password) {
      throw new BadRequestException('Account password is required to delete an asset.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new BadRequestException('Incorrect password. Asset deletion aborted.');
    }

    const normalizedCode = code.trim().toUpperCase();
    const investment = await this.prisma.investment.findFirst({
      where: {
        userId,
        OR: [
          { code: normalizedCode },
          { id: code },
          { assetId: normalizedCode }
        ]
      }
    });

    if (!investment) {
      throw new NotFoundException(`Asset holding "${code}" not found.`);
    }

    // Cascade delete: Prisma schema has onDelete: Cascade for InvestmentTransaction
    await this.prisma.investment.delete({
      where: { id: investment.id }
    });

    return {
      deleted: true,
      code: investment.code,
      name: investment.name
    };
  }
}
