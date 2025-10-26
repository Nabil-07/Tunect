import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class RefundDto {
  @IsString()
  paymentId!: string; // definite assignment

  @IsOptional()
  @IsInt()
  @Min(1)
  amountInMinor?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
