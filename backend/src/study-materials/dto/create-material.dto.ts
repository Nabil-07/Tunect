import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateMaterialDto {
  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  fileUrl!: string;

  @IsString()
  fileType!: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
