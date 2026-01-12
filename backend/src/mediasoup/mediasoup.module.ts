import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MediasoupService } from './mediasoup.service';

@Module({
  imports: [ConfigModule],
  providers: [MediasoupService],
  exports: [MediasoupService],
})
export class MediasoupModule {}
