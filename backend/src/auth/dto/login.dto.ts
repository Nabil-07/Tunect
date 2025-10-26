// src/auth/dto/login.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;          // <-- definite assignment

  @IsString()
  @MinLength(6)
  password!: string;       // <-- definite assignment
}
