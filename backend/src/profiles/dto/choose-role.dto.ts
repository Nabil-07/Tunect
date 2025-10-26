import { IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class ChooseRoleDto {
  @IsEnum(Role)
  role!: Role; // 'STUDENT' | 'TUTOR'
}
