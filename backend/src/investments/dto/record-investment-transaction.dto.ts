import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RecordInvestmentTransactionDto {
  @IsString()
  @IsIn(['BUY', 'SELL'])
  type!: 'BUY' | 'SELL';

  @IsNumber()
  @Min(0.0001)
  units!: number;

  @IsNumber()
  @Min(0.01)
  price!: number;

  @IsOptional()
  @IsString()
  date?: string;
}
