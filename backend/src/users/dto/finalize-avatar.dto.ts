import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class FinalizeAvatarDto {
  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  avatarKey?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  /** When true, allows KYC-approved tutors to re-crop their existing avatar */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  reposition?: boolean;
}
