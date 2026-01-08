// src/messages/messages.module.ts
import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { ChatTriggersService } from './chat-triggers.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../common/request-context';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [MessagesController],
  providers: [
    PrismaService,
    RequestContext,
    MessagesService,
    ChatTriggersService,
    MessagesGateway,
  ],
  exports: [MessagesService, ChatTriggersService, MessagesGateway],
})
export class MessagesModule {}
