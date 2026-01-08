import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3Service } from './services/s3.service';
import { OpenAIService } from './services/openai.service';
import { PiiGuardService } from './pii-guard.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [S3Service, OpenAIService, PiiGuardService],
  exports: [S3Service, OpenAIService, PiiGuardService],
})
export class CommonModule {}
