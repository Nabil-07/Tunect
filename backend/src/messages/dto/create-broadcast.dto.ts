// src/messages/dto/create-broadcast.dto.ts
import { IsNotEmpty, IsString, IsArray, IsOptional, ArrayMinSize } from 'class-validator';

export class CreateBroadcastDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  memberIds!: string[];

  @IsOptional()
  @IsString()
  initialMessage?: string;
}
