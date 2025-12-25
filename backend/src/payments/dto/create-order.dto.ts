import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  tutorId!: string;

  @IsInt()
  @Min(10) // enforce minimum purchase of 10 tokens
  tokens!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  displayCurrency?: string; // e.g., 'USD', 'EUR' - for receipt/display only
}
