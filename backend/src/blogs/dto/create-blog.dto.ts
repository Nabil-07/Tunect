import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { BlogStatus } from '@prisma/client';

export class CreateBlogDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;

  @IsOptional()
  @IsString()
  authorName?: string;

  @IsOptional()
  @IsBoolean()
  isPillar?: boolean;

  @IsOptional()
  @IsString()
  pillarId?: string;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;
}
