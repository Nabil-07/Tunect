import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdjustTokensDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string; // Student.id (not userId)

  @IsInt()
  delta!: number; // positive for credit, negative for debit

  // Optional linkage to a booking or payment if the admin is correcting one
  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  paymentId?: string;
}
