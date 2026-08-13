import { IsDateString, IsNumber, IsOptional, IsString, Min, IsIn, IsArray } from 'class-validator';

export class UpdateExpenseDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @IsIn(['EXPENSE', 'INCOME', 'TRANSFER'])
  transactionType?: string;

  @IsOptional()
  @IsString()
  toUserId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ESSENTIALS', 'HIGH_VALUE', 'LIFESTYLE'])
  categoryType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

