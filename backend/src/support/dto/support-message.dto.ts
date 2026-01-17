import { IsString, Length } from 'class-validator';

export class SupportMessageDto {
  @IsString()
  @Length(1, 2000)
  message!: string;
}
