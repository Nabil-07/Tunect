import { IsArray, IsString } from 'class-validator';

export class ShareMaterialDto {
  @IsArray()
  @IsString({ each: true })
  studentIds!: string[];
}
