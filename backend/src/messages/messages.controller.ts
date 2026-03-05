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
  Header,
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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
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
@Controller('chat')
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

  @ApiOperation({ summary: 'Post a message to an existing conversation' })
  @Throttle({ default: { ttl: 60, limit: 40 } })
  @Post('conversations/:id/messages')
  postToConversation(
    @Param('id') id: string,
    @Body('content') content?: string,
    @Body('text') text?: string,
  ) {
    const dto: PostMessageDto = {
      conversationId: id,
      text: (content ?? text ?? '').toString(),
    };
    return this.svc.post(dto);
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

  /** List archived conversations */
  @ApiOperation({ summary: 'Get archived conversations' })
  @Get('conversations/archived')
  getArchivedConversations(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const nRaw = Number(limit ?? 20);
    const n = Number.isFinite(nRaw) ? Math.min(50, Math.max(1, nRaw)) : 20;
    return this.svc.listArchivedConversations(userId, cursor, n);
  }

  /** Archive a conversation */
  @ApiOperation({ summary: 'Archive a conversation' })
  @Post('conversations/:id/archive')
  archiveConversation(
    @Param('id') conversationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.archiveConversation(conversationId, userId);
  }

  /** Unarchive a conversation */
  @ApiOperation({ summary: 'Unarchive a conversation' })
  @Post('conversations/:id/unarchive')
  unarchiveConversation(
    @Param('id') conversationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.unarchiveConversation(conversationId, userId);
  }

  /** Dashboard widget: unread count */
  @ApiOperation({ summary: 'Get my unread message count' })
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
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
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @Get('unread-count')
  unreadDash(@CurrentUser('id') userId: string) {
    return this.unread(userId);
  }

  // ─── Admin Broadcast & Private Messaging ───────────────────────────

  @ApiOperation({ summary: 'Send broadcast announcement to tutors (admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('broadcast')
  broadcast(
    @CurrentUser('id') userId: string,
    @Body() body: { message: string; subject?: string },
  ) {
    return this.svc.sendBroadcast(userId, body.message, body.subject);
  }

  @ApiOperation({ summary: 'Send private message to a user (admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('private-message')
  privateMessage(
    @CurrentUser('id') userId: string,
    @Body() body: { recipientId: string; message: string },
  ) {
    return this.svc.sendPrivateMessage(userId, body.recipientId, body.message);
  }

  @ApiOperation({ summary: 'List broadcast history (admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('broadcasts')
  listBroadcasts(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.listBroadcasts(
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }

  @ApiOperation({ summary: 'List private messages history (admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('private-messages')
  listPrivateMessages(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.listPrivateMessages(
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }

  @ApiOperation({ summary: 'Get distinct subjects from approved tutors' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('subjects')
  getSubjects() {
    return this.svc.getDistinctSubjects();
  }

  @ApiOperation({ summary: 'Get admin messages received by the current user' })
  @Get('my-admin-messages')
  myAdminMessages(@CurrentUser('id') userId: string) {
    return this.svc.getMyAdminMessages(userId);
  }
}
