import { Module } from '@nestjs/common';
import { WhiteboardController } from './whiteboard.controller';
import { WhiteboardService } from './whiteboard.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [WhiteboardController],
  providers: [WhiteboardService],
  exports: [WhiteboardService],
})
export class WhiteboardModule {}
