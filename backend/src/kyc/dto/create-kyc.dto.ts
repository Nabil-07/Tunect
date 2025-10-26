import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateKycDto {
  @ApiProperty({ example: 'PAN' })
  @IsString()
  docType!: string;

  @ApiProperty({ example: 'https://cdn.example.com/kyc/pan_abc123.pdf' })
  @IsString()
  url!: string;

  @ApiProperty({ example: 'Clear scan', required: false })
  notes?: string;
}
