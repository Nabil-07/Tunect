import { Controller, Post, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ChatbotService } from './chatbot.service';
import { ChatMessageDto } from './dto/chat-message.dto';

function extractBearerToken(
  bodyToken?: string,
  authHeader?: string,
): string {
  if (bodyToken?.trim()) return bodyToken.trim();
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

@ApiTags('chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a message to the AI chatbot' })
  async chat(
    @Body() dto: ChatMessageDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const role = dto.role ?? 'guest';
    const jwtToken = extractBearerToken(dto.jwt_token, authHeader);
    return this.chatbotService.sendMessage(dto.message, role, jwtToken, dto.thread_id);
  }
}