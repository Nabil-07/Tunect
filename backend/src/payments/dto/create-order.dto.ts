import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderDto {
  @IsString()
  tutorId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(5) // enforce minimum purchase of 5 tokens
  tokens!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  displayCurrency?: string; // e.g., 'USD', 'EUR' - for receipt/display only
}
