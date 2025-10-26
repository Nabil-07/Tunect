import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTutorDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  bio?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  subjects?: string[];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  hourlyRate?: number;
}
