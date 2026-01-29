// src/tutors/tutors.module.ts
import { Module } from '@nestjs/common';
import { TutorsController } from './tutors.controller';
import { TutorsService } from './tutors.service';
import { PrismaService } from '../prisma/prisma.service';
import { TutorWalletController } from './tutor-wallet.controller';
import { TutorWalletService } from './tutor-wallet.service';
import { AvailabilityTrackingService } from '../availability/availability-tracking.service';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [AvailabilityModule],
  controllers: [TutorsController, TutorWalletController],
  providers: [TutorsService, TutorWalletService, PrismaService],
  exports: [TutorsService],
})
export class TutorsModule {}
