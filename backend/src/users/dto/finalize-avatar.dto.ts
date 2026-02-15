import { IsOptional, IsString } from 'class-validator';

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
}
