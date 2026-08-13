import { IsEmail, IsNotEmpty, IsPhoneNumber, MinLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsPhoneNumber()
  phoneNumber!: string;

  @MinLength(8)
  password!: string;
}
