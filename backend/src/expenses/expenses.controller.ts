import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CreateExpensesBulkDto } from './dto/bulk-create-expense.dto';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  findAll(
    @CurrentUser() user: { sub: string },
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryType') categoryType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string
  ) {
    return this.expensesService.findAll(user.sub, {
      category,
      tag,
      from,
      to,
      categoryType,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined
    });
  }

  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(user.sub, dto);
  }

  @Post('bulk')
  createBulk(@CurrentUser() user: { sub: string }, @Body() dto: CreateExpensesBulkDto) {
    return this.expensesService.createBulk(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto
  ) {
    return this.expensesService.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.expensesService.remove(user.sub, id);
  }
}
