import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateExpenseDto } from './create-expense.dto';

export class CreateExpensesBulkDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  expenses!: CreateExpenseDto[];
}
