import { Module } from '@nestjs/common';
import { SessionNotesController } from './session-notes.controller';
import { SessionNotesService } from './session-notes.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SessionNotesController],
  providers: [SessionNotesService],
  exports: [SessionNotesService],
})
export class SessionNotesModule {}
