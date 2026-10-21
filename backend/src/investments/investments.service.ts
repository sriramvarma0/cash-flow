import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { UpdateInvestmentTransactionDto } from './dto/update-investment-transaction.dto';
import { generateTransactionTrackingId, generateAssetTrackingId } from '../common/utils/uuid7.util';
import * as bcrypt from 'bcrypt';
import yahooFinance from 'yahoo-finance2';

const yahoo = new yahooFinance({ suppressNotices: ['yahooSurvey'] });

const assetColors = ['#0d533c', '#17a66b', '#3ecb8e', '#7fe0b5', '#a6bbbb', '#5b7676', '#3b82f6', '#f59e0b', '#ef4444'];

@Injectable()
export class InvestmentsService {
  constructor(private readonly prisma: PrismaService) {}

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
        transactions: {
          orderBy: { date: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Refresh pricing in the database on page fetch and enrich with live quote metadata
    const refreshed = await Promise.all(
      investments.map(async (inv) => {
        try {
          const freshData = await this.fetchTickerData(inv.code, inv.type);
          const updates: any = {};
          if (freshData.price > 0 && Math.abs(freshData.price - inv.currentPrice) > 0.001) {
            updates.currentPrice = freshData.price;
            inv.currentPrice = freshData.price;
          }
          if (freshData.name && freshData.name !== inv.code && inv.name === inv.code) {
            updates.name = freshData.name;
            inv.name = freshData.name;
          }

          if (Object.keys(updates).length > 0) {
            await this.prisma.investment.update({
              where: { id: inv.id },
              data: updates
            });
          }

          return {
            ...inv,
            dividendYield: freshData.dividendYield,
            beta: freshData.beta
          };
        } catch {
          // ignore
        }
        return {
          ...inv,
          dividendYield: 0,
          beta: 1.0
        };
      })
    );

    return refreshed;
  }

  async create(userId: string, dto: CreateInvestmentDto) {
    const count = await this.prisma.investment.count({ where: { userId } });
    const color = assetColors[count % assetColors.length];

    const tickerData = await this.fetchTickerData(dto.code, dto.type);
    
    // Validate ticker code existence on Yahoo Finance or AMFI APIs based on selection
    if (!tickerData.price || tickerData.price <= 0) {
      throw new BadRequestException(
        `Asset code "${dto.code}" could not be resolved for class "${dto.type}". Please check the code.`
      );
    }

    // Generate unique Asset Tracking ID with 'A' prefix followed by 9 alphanumeric characters
    let assetId = generateAssetTrackingId();
    while (await this.prisma.investment.findUnique({ where: { id: assetId } })) {
      assetId = generateAssetTrackingId();
    }

    const created = await this.prisma.investment.create({
      data: {
        id: assetId,
        code: dto.code.trim().toUpperCase(),
        name: tickerData.name,
        type: dto.type,
        units: dto.units,
        buyPrice: dto.buyPrice,
        currentPrice: tickerData.price,
        color,
        date: dto.date ? new Date(dto.date) : new Date(),
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
        date: dto.date ? new Date(dto.date) : new Date(),
        investmentId: created.id,
        userId
      }
    });

    return {
      ...created,
      transactions: [initialTx],
      dividendYield: tickerData.dividendYield,
      beta: tickerData.beta
    };
  }

  async recordTransaction(
    userId: string,
    code: string,
    dto: { type: 'BUY' | 'SELL'; units: number; price: number; date?: string }
  ) {
    const investment = await this.prisma.investment.findFirst({
      where: { userId, code: code.toUpperCase() }
    });

    if (!investment) {
      throw new BadRequestException(`Holding with code "${code}" not found.`);
    }

    if (dto.units <= 0 || dto.price <= 0) {
      throw new BadRequestException('Units and price must be greater than 0.');
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

    return {
      transaction: tx,
      investment: updatedInvestment
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

    return {
      transaction: updatedTx,
      investment: updatedInvestment
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

    return {
      deleted: true,
      investment: updatedInvestment
    };
  }

  async getTransactions(userId: string, code?: string) {
    if (code) {
      const investment = await this.prisma.investment.findFirst({
        where: { userId, code: code.toUpperCase() }
      });
      if (!investment) return [];
      return this.prisma.investmentTransaction.findMany({
        where: { userId, investmentId: investment.id },
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
      throw new UnauthorizedException('Incorrect password. Asset deletion aborted.');
    }

    const investment = await this.prisma.investment.findFirst({
      where: {
        userId,
        OR: [
          { code: code.toUpperCase() },
          { id: code }
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
