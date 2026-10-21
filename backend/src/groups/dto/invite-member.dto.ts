import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class InviteMemberDto {
  @IsString()
  @IsOptional()
  userId?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  phoneNumber?: string;
}
