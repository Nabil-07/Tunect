import { IsString } from 'class-validator';
export class ExecuteBatchDto { @IsString() batchKey!: string; }
