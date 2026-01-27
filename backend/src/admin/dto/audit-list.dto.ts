import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsISO8601, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditEntityType } from '@prisma/client';

export class AuditListDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional({ enum: AuditEntityType, example: 'TUTOR' })
  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @ApiPropertyOptional({ example: '2025-01-01T00:00:00Z', description: 'Filter logs from this date (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2025-01-31T23:59:59Z', description: 'Filter logs until this date (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
