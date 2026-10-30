import { IsDateString, IsNumber, IsOptional, IsString, Min, IsIn, IsArray, IsBoolean } from 'class-validator';

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
  @IsString()
  paymentAccount?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @IsIn(['EXPENSE', 'INCOME', 'TRANSFER', 'RECEIVABLE'])
  transactionType?: string;

  @IsOptional()
  @IsString()
  toUserId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ESSENTIALS', 'HIGH_VALUE', 'LIFESTYLE'])
  categoryType?: string;

  @IsOptional()
  @IsBoolean()
  isReceivable?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['OUTSTANDING', 'PARTIALLY_SETTLED', 'SETTLED'])
  receivableStatus?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reimbursedAmount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

