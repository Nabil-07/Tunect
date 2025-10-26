import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BookableQueryDto {
  @ApiPropertyOptional({ example: '2025-08-15T08:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2025-08-20T20:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ example: 60, description: 'Required session length (minutes)' })
  @IsOptional()
  @Type(() => Number) @IsInt() @Min(15)
  durationMin?: number = 60;

  @ApiPropertyOptional({ example: 15, description: 'Grid step in minutes' })
  @IsOptional()
  @Type(() => Number) @IsInt() @Min(5)
  stepMin?: number = 15;
}
