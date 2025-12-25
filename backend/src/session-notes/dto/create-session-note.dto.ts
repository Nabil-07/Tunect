import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateSessionNoteDto {
  @IsString()
  content!: string;

  @IsBoolean()
  @IsOptional()
  aiGenerated?: boolean;
}
