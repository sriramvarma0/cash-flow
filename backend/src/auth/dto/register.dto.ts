import { IsEmail, IsNotEmpty, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @Matches(/^\+?[1-9][0-9\s-]{6,16}$/, {
    message: 'phoneNumber must be a valid phone number (e.g. +91 98765 43210 or +1 202 555 0123)'
  })
  phoneNumber!: string;

  @MinLength(8)
  password!: string;
}
