import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ description: 'User message text' })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({ default: 'guest' })
  @IsString()
  @IsOptional()
  role?: string = 'guest';

  @ApiPropertyOptional({ description: 'JWT auth token for authenticated users' })
  @IsString()
  @IsOptional()
  jwt_token?: string = '';

  @ApiPropertyOptional({ description: 'Conversation thread ID for context continuity' })
  @IsString()
  @IsOptional()
  thread_id?: string;
}