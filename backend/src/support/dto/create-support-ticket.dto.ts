import { IsOptional, IsString, Length } from 'class-validator';

export class CreateSupportTicketDto {
  @IsOptional()
  @IsString()
  @Length(0, 120)
  subject?: string;

  @IsString()
  @Length(1, 2000)
  message!: string;
}
