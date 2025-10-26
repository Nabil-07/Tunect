// src/auth/dto/forgot-reset.dto.ts
import { IsString, MinLength } from 'class-validator';

export class ForgotResetDto {
  @IsString()
  resetToken!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
