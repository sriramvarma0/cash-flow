import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateInvestmentTransactionDto {
  @IsOptional()
  @IsString()
  @IsIn(['BUY', 'SELL'])
  type?: 'BUY' | 'SELL';

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  units?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  price?: number;

  @IsOptional()
  @IsString()
  date?: string;
}
