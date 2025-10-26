// src/search/dto/search-tutors.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchTutorsDto {
  @ApiPropertyOptional({ example: 'Math' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @Type(() => Number) @IsInt() @Min(0)
  minRate?: number;

  @ApiPropertyOptional({ example: 800 })
  @IsOptional()
  @Type(() => Number) @IsInt() @Min(0)
  maxRate?: number;

  @ApiPropertyOptional({ example: '2025-08-15T10:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2025-08-15T14:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number) @IsInt() @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional({ example: 'algebra' })
  @IsOptional()
  @IsString()
  q?: string; // text search against tutor.bio
}
