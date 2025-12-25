import { IsInt, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConvertToGroupSessionDto {
  @ApiProperty({ example: 5, description: 'Maximum number of students (2-10)' })
  @IsInt()
  @Min(2)
  @Max(10)
  maxStudents!: number;

  @ApiProperty({ example: 50, description: 'Price per student in tokens (0.5 tokens will be charged)' })
  @IsNumber()
  @Min(0)
  pricePerStudent!: number;
}
