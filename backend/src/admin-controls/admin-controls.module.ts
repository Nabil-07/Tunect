// src/admin-controls/admin-controls.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminControlsController } from './admin-controls.controller';
import { AdminControlsService } from './admin-controls.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminControlsController],
  providers: [AdminControlsService],
  exports: [AdminControlsService],
})
export class AdminControlsModule {}
