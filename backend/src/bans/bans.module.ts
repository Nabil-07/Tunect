import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BansService } from './bans.service';
import { BansController } from './bans.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BansController],
  providers: [BansService],
  exports: [BansService],
})
export class BansModule {}
