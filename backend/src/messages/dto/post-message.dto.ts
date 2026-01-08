import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PostMessageDto {
  // Explicit conversation id (used when posting to an existing thread)
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  // peer can be tutor.id or tutor.userId (if sender is a student),
  // or student.id or student.userId (if sender is a tutor)
  @IsOptional()
  @IsString()
  peerId?: string;

  @IsString()
  @MaxLength(2000)
  text!: string;
}
