import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { KycStatus } from '@prisma/client';

export class ReviewKycDto {
  @ApiProperty({ enum: KycStatus, example: 'APPROVED' })
  @IsEnum(KycStatus)
  status!: KycStatus; // APPROVED | REJECTED

  @ApiProperty({ example: 'All details match', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
