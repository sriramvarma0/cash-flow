import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateExpenseDto } from './create-expense.dto';

export class CreateExpensesBulkDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseDto)
  expenses!: CreateExpenseDto[];

  @IsOptional()
  @IsString()
  importId?: string;
}
