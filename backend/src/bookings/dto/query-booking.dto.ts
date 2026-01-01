import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';

export class QueryBookingDto {
  @ApiPropertyOptional({ example: 'cmjr15hyl0004hxqk8svmw3tf' })
  @IsOptional()
  @IsString()
  tutorId?: string;

  @ApiPropertyOptional({ example: 'cmjpnroq00000hxk8xq84wvk7' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({
    enum: BookingStatus,
    example: BookingStatus.CONFIRMED,
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
