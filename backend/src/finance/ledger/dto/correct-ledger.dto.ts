import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
export class CorrectLedgerDto {
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsString() reason?: string;
}
