import { IsString, IsInt, Min, Max, IsOptional, Matches } from 'class-validator';

export class CreateReviewDto {
  @IsString()
  @Matches(/^[a-z0-9]{10,}$/i, {
    message: 'bookingId must be a valid ID format (CUID)',
  })
  bookingId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
