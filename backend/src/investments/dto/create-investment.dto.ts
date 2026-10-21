import { IsNumber, IsString, Min, IsOptional } from 'class-validator';

export class CreateInvestmentDto {
  @IsString()
  code!: string;

  @IsString()
  type!: string;

  @IsNumber()
  @Min(0.001)
  units!: number;

  @IsNumber()
  @Min(0.01)
  buyPrice!: number;

  @IsOptional()
  @IsString()
  date?: string;
}
