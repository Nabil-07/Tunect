// src/messages/messages.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { MessagesService } from './messages.service';
import { PostMessageDto } from './dto/post-message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// Use whichever path your decorator actually lives at:
import { CurrentUser } from '../common/decorators/current-user.decorator'; // or '../auth/current-user.decorator'

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
/**
 * New throttler API: pass a record keyed by limiter name.
 * You defined a limiter named "default" in AppModule:
 * ThrottlerModule.forRoot([{ name: 'default', ttl: 60, limit: 120 }])
 * Override here to 60 req / 60s for reads.
 */
@Throttle({ default: { ttl: 60, limit: 60 } })
@Controller('messages')
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @ApiOperation({
    summary: 'Post a message to a conversation (by booking/peer as defined in DTO)',
  })
  // Writes stricter: 20 req / 60s (same limiter name)
  @Throttle({ default: { ttl: 60, limit: 20 } })
  @Post()
  post(@Body() dto: PostMessageDto, @CurrentUser('id') _userId: string) {
    // Service reads user from RequestContext internally
    return this.svc.post(dto);
  }

  @ApiOperation({ summary: 'Fetch a message thread (paginated)' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Message id cursor; returns items after this id (ASC in response)',
    example: 'msg_01J123ABCDEF',
  })
  @Get('thread/:id')
  getThread(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.svc.getThread(id, cursor);
  }

  // Alias with plural for frontend variants
  @ApiOperation({ summary: 'Fetch a message thread (alias)' })
  @Get('threads/:id')
  getThreadAlias(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.svc.getThread(id, cursor);
  }

  @ApiOperation({ summary: 'Mark a thread as read (no-op placeholder)' })
  @HttpCode(204)
  @Post('threads/:id/read')
  async markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.svc.markThreadRead(id, userId);
    return;
  }

  @ApiOperation({ summary: 'List my conversations (inbox)' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'CreatedAt ISO string; returns conversations before this timestamp',
    example: '2025-08-12T10:00:00.000Z',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size (default 20, max 50)',
    example: 20,
  })
  @Get('conversations')
  getConversations(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const nRaw = Number(limit ?? 20);
    const n = Number.isFinite(nRaw) ? Math.min(50, Math.max(1, nRaw)) : 20;
    return this.svc.listConversations(userId, cursor, n);
  }

  /** Dashboard widget: unread count */
  @ApiOperation({ summary: 'Get my unread message count' })
  @Get('unread_count')
  unread(@CurrentUser('id') userId: string) {
    const svcAny = this.svc as any;
    if (typeof svcAny.getUnreadCount === 'function') {
      return svcAny.getUnreadCount(userId); // { count: number }
    }
    return { count: 0 };
  }

  // Alias with dash for frontend variants
  @ApiOperation({ summary: 'Get my unread message count (alias)' })
  @Get('unread-count')
  unreadDash(@CurrentUser('id') userId: string) {
    return this.unread(userId);
  }
}
