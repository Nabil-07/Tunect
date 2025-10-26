// src/auth/dto/forgot-verify.dto.ts
import { IsIn, IsString, Length, IsEmail, IsOptional } from 'class-validator';

export class ForgotVerifyDto {
  @IsIn(['email', 'phone'])
  method!: 'email' | 'phone';

  @IsString()
  @Length(4, 8)
  code!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(6, 20)
  phone?: string;
}
