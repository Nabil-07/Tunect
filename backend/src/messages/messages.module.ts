// src/messages/messages.module.ts
import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { EnhancedMessagesController } from './enhanced-messages.controller';
import { EnhancedMessagesService } from './enhanced-messages.service';
import { ChatTriggersService } from './chat-triggers.service';
import { MessagesGateway } from './messages.gateway';
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
  controllers: [MessagesController, EnhancedMessagesController],
  providers: [
    PrismaService,
    RequestContext,
    MessagesService,
    EnhancedMessagesService,
    ChatTriggersService,
    MessagesGateway,
  ],
  exports: [MessagesService, EnhancedMessagesService, ChatTriggersService, MessagesGateway],
})
export class MessagesModule {}
