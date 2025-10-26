// src/auth/dto/forgot-start.dto.ts
import { IsIn, IsOptional, IsEmail, IsString, Length } from 'class-validator';

export class ForgotStartDto {
  @IsIn(['email', 'phone'])
  method!: 'email' | 'phone';

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(6, 20) // adjust to your phone formats
  phone?: string;
}
