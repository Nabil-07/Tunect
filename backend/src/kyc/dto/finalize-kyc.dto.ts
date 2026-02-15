import { IsOptional, IsString } from 'class-validator';

export class FinalizeKycDto {
  @IsString()
  key!: string;

  @IsString()
  docType!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
