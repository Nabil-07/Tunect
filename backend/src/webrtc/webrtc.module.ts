import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { WebrtcGateway } from './webrtc.gateway';
import { WebrtcService } from './webrtc.service';
import { WebrtcController } from './webrtc.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';
import { AuthModule } from '../auth/auth.module';
import { MediasoupModule } from '../mediasoup/mediasoup.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    BookingsModule,
    AuthModule,
    MediasoupModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET') || 'changeme',
        signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRES_IN') || '12h' },
      }),
    }),
  ],
  controllers: [WebrtcController],
  providers: [WebrtcGateway, WebrtcService],
  exports: [WebrtcService],
})
export class WebrtcModule {}
