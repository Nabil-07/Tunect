import { Module } from '@nestjs/common';
import { GoogleMeetService } from './google-meet.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [GoogleMeetService, PrismaService],
  exports: [GoogleMeetService],
})
export class GoogleMeetModule {}
