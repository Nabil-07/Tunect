import { IsInt, Min, IsOptional } from 'class-validator';

export class CreateStudentDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  tokens?: number; // default to 0 in DB if omitted
}
