import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3Service } from './services/s3.service';
import { OpenAIService } from './services/openai.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [S3Service, OpenAIService],
  exports: [S3Service, OpenAIService],
})
export class CommonModule {}
