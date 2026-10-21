import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { RecordInvestmentTransactionDto } from './dto/record-investment-transaction.dto';
import { UpdateInvestmentTransactionDto } from './dto/update-investment-transaction.dto';
import { InvestmentsService } from './investments.service';

@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  @Get()
  findAll(@CurrentUser() user: { sub: string }) {
    return this.investmentsService.findAll(user.sub);
  }

  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateInvestmentDto) {
    return this.investmentsService.create(user.sub, dto);
  }

  @Get('transactions')
  getAllTransactions(@CurrentUser() user: { sub: string }) {
    return this.investmentsService.getTransactions(user.sub);
  }

  @Get(':code/transactions')
  getTransactionsByCode(
    @CurrentUser() user: { sub: string },
    @Param('code') code: string
  ) {
    return this.investmentsService.getTransactions(user.sub, code);
  }

  @Post(':code/transactions')
  recordTransaction(
    @CurrentUser() user: { sub: string },
    @Param('code') code: string,
    @Body() dto: RecordInvestmentTransactionDto
  ) {
    return this.investmentsService.recordTransaction(user.sub, code, dto);
  }

  @Put('transactions/:id')
  updateTransaction(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: UpdateInvestmentTransactionDto
  ) {
    return this.investmentsService.updateTransaction(user.sub, id, dto);
  }

  @Patch('transactions/:id')
  patchTransaction(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: UpdateInvestmentTransactionDto
  ) {
    return this.investmentsService.updateTransaction(user.sub, id, dto);
  }

  @Delete('transactions/:id')
  deleteTransaction(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string
  ) {
    return this.investmentsService.deleteTransaction(user.sub, id);
  }

  @Delete(':code')
  deleteAsset(
    @CurrentUser() user: { sub: string },
    @Param('code') code: string,
    @Body() body: { password?: string }
  ) {
    return this.investmentsService.deleteAsset(user.sub, code, body?.password);
  }
}


