import { IsNumber, IsString } from 'class-validator';
export class ReconAdjustmentDto {
  @IsString() date!: string;   // YYYY-MM-DD
  @IsNumber() amount!: number; // +/- variance
  @IsString() reason!: string;
}
