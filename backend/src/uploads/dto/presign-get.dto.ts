import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PresignGetDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  expiresIn?: number;
}
