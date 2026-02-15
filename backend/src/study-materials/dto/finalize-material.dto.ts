import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class FinalizeMaterialDto {
  @IsString()
  key!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  fileType?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
