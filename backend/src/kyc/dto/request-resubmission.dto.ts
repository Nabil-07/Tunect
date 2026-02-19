import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ArrayMinSize } from 'class-validator';

export class RequestResubmissionDto {
  @ApiProperty({
    type: [String],
    example: ['phone', 'ifsc', 'selfie'],
    description: 'KYC fields that tutor must update before resubmitting.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  fields!: string[];

  @ApiProperty({
    example: 'IFSC code is invalid and selfie is blurred. Please update both.',
    required: false,
  })
  @IsOptional()
  @IsString()
  message?: string;
}
