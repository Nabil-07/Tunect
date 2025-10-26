import { IsNumber, IsString } from 'class-validator';
export class RecordGstItcDto {
  @IsString() month!: string;
  @IsNumber() itcAmount!: number;
  @IsString() notes!: string;
}
