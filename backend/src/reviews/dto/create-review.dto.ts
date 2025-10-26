import { IsString, IsUUID, IsInt, Min, Max, IsOptional } from 'class-validator';

export class CreateReviewDto {
  @IsUUID()
  bookingId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
