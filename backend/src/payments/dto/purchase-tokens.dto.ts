// src/payments/dto/purchase-tokens.dto.ts
import { IsInt, Min, IsOptional, IsString } from 'class-validator';

export class PurchaseTokensDto {
  @IsInt() @Min(5)
  tokens!: number; // min 5 (₹1 = 1 token)

  @IsOptional() @IsString()
  idempotencyKey?: string; // optional (you can pass through to metadata)
}
