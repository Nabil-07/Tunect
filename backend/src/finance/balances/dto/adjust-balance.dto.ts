import { IsNumber, IsString, IsIn } from 'class-validator';
export class AdjustBalanceDto {
  @IsNumber() amount!: number;
  @IsIn(['CREDIT', 'DEBIT']) type!: 'CREDIT' | 'DEBIT';
  @IsString() reason!: string;
}
