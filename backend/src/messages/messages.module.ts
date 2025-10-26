// src/messages/messages.module.ts
import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../common/request-context';

@Module({
  controllers: [MessagesController],
  providers: [PrismaService, RequestContext, MessagesService],
  exports: [MessagesService], // <-- export for other modules that may inject it
})
export class MessagesModule {}
