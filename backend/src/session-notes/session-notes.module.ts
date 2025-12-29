import { Module } from '@nestjs/common';
import { SessionNotesController } from './session-notes.controller';
import { SessionNotesService } from './session-notes.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [SessionNotesController],
  providers: [SessionNotesService],
  exports: [SessionNotesService],
})
export class SessionNotesModule {}
