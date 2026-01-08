// src/messages/enhanced-messages.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EnhancedMessagesService } from './enhanced-messages.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { AddMembersDto, RemoveMembersDto } from './dto/manage-members.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class EnhancedMessagesController {
  constructor(private readonly messagesService: EnhancedMessagesService) {}

  /**
   * POST /chat/conversations/:id/messages
   * Send a message in a conversation
   */
  @Post('conversations/:id/messages')
  async postMessage(@Param('id') conversationId: string, @Body() body: { content: string }) {
    return this.messagesService.postMessage(conversationId, body.content);
  }

  /**
   * GET /chat/conversations/:id
   * Get conversation details with messages
   */
  @Get('conversations/:id')
  async getConversation(@Param('id') conversationId: string) {
    return this.messagesService.getConversation(conversationId);
  }

  /**
   * GET /chat/conversations
   * List all conversations for current user
   */
  @Get('conversations')
  async listConversations() {
    return this.messagesService.listConversations();
  }

  /**
   * DELETE /chat/messages/:id
   * Soft delete a message (admin only)
   */
  @Delete('messages/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async deleteMessage(@Param('id') messageId: string) {
    return this.messagesService.deleteMessage(messageId);
  }

  /**
   * POST /chat/broadcast
   * Create admin broadcast group
   */
  @Post('broadcast')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async createBroadcast(@Body() dto: CreateBroadcastDto) {
    return this.messagesService.createBroadcast(dto);
  }

  /**
   * POST /chat/conversations/:id/members
   * Add members to broadcast conversation
   */
  @Post('conversations/:id/members')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async addMembers(@Param('id') conversationId: string, @Body() dto: AddMembersDto) {
    return this.messagesService.addMembers(conversationId, dto);
  }

  /**
   * Delete /chat/conversations/:id/members
   * Remove members from broadcast conversation
   */
  @Delete('conversations/:id/members')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async removeMembers(@Param('id') conversationId: string, @Body() dto: RemoveMembersDto) {
    return this.messagesService.removeMembers(conversationId, dto);
  }

  /**
   * GET /chat/conversations/:id/export
   * Export conversation history (admin only)
   */
  @Get('conversations/:id/export')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async exportConversation(@Param('id') conversationId: string) {
    return this.messagesService.exportConversation(conversationId);
  }
}
