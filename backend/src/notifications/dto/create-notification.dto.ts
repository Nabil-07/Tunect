import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum NotificationType {
  BOOKING = 'BOOKING',
  MESSAGE = 'MESSAGE',
  PAYMENT = 'PAYMENT',
  REMINDER = 'REMINDER',
  SYSTEM = 'SYSTEM',
}

export class CreateNotificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  bookingId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  link?: string;
}
