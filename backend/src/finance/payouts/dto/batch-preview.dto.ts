import { IsString, IsOptional } from 'class-validator';
export class BatchPreviewDto { @IsString() batchKey!: string; @IsOptional() @IsString() tutorId?: string; }
