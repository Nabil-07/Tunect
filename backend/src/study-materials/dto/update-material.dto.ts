import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class UpdateMaterialDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsString()
  @IsOptional()
  subject?: string;
}
