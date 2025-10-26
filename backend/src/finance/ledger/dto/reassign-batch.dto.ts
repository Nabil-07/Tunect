import { IsString } from 'class-validator';
export class ReassignBatchDto { @IsString() batchKey!: string; }
