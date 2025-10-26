import { IsNumber, IsString } from 'class-validator';
export class RecordTdsDepositDto {
  @IsString() month!: string;  // '2025-09'
  @IsNumber() amount!: number;
  @IsString() challanRef!: string;
}
