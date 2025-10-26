import { IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';

export class QueryBookingDto {
  @ApiPropertyOptional({ example: 'b5b27c5b-33d8-4e2b-91a2-3a7b93f5d1aa' })
  @IsOptional()
  @IsUUID()
  tutorId?: string;

  @ApiPropertyOptional({ example: 'd62e3cd4-8d46-4f0b-8f50-1cdb74b94f4c' })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    enum: BookingStatus,
    example: BookingStatus.CONFIRMED,
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
