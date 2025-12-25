import { Module, forwardRef } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WaitlistModule } from '../waitlist/waitlist.module';

@Module({
  imports: [PrismaModule, forwardRef(() => WaitlistModule)],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
