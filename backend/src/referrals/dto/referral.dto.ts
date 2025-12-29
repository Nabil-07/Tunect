import { IsString, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReferralDto {
  @ApiProperty()
  @IsEmail()
  referredEmail!: string;
}

export class ApplyReferralDto {
  @ApiProperty()
  @IsString()
  referralCode!: string;
}

export class ProcessReferralRewardDto {
  @ApiProperty()
  @IsString()
  bookingId!: string;

  @ApiProperty()
  @IsString()
  studentId!: string;
}
