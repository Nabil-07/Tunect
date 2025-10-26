import { IsNumber, IsString } from 'class-validator';
export class HoldReleaseDto {
  @IsNumber() amount!: number;
  @IsString() reason!: string;
}
