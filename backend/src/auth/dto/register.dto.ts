// src/auth/dto/register.dto.ts
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password!: string;

  @IsEnum(Role, {
    message: 'Role must be one of: STUDENT, TUTOR, ADMIN',
  })
  role!: Role;
}
