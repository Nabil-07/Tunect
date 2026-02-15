import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const UPLOAD_USE_CASES = ['kyc', 'study-materials', 'certificates', 'avatars'] as const;
export type UploadUseCase = (typeof UPLOAD_USE_CASES)[number];

export class PresignUploadDto {
  @IsString()
  @IsIn(UPLOAD_USE_CASES)
  useCase!: UploadUseCase;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  size!: number;

  @IsOptional()
  @IsString()
  docType?: string;
}
