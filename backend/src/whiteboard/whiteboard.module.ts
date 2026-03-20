import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { WhiteboardController } from './whiteboard.controller';
import { WhiteboardService } from './whiteboard.service';
import { WhiteboardGateway } from './whiteboard.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule, JwtModule, ConfigModule],
  controllers: [WhiteboardController],
  providers: [WhiteboardService, WhiteboardGateway],
  exports: [WhiteboardService],
})
export class WhiteboardModule {}
