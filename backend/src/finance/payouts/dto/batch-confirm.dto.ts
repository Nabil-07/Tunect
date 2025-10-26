import { IsString, IsBoolean, IsOptional } from 'class-validator';
export class BatchConfirmDto { @IsString() batchKey!: string; @IsOptional() @IsBoolean() dryRun?: boolean; }
