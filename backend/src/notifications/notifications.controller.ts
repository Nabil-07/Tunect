import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @ApiOperation({ summary: 'Get my notifications' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @Get('my')
  async getMyNotifications(
    @CurrentUser('sub') userId: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const onlyUnread = unreadOnly === 'true';
    return this.service.getUserNotifications(userId, onlyUnread);
  }

  @ApiOperation({ summary: 'Get unread count' })
  @Get('my/unread-count')
  async getUnreadCount(@CurrentUser('sub') userId: string) {
    const count = await this.service.getUnreadCount(userId);
    return { count };
  }

  @ApiOperation({ summary: 'Mark notification as read' })
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.markAsRead(id, userId);
  }

  @ApiOperation({ summary: 'Mark all notifications as read' })
  @Patch('mark-all-read')
  async markAllAsRead(@CurrentUser('sub') userId: string) {
    return this.service.markAllAsRead(userId);
  }

  @ApiOperation({ summary: 'Create notification (internal use)' })
  @Post()
  async create(@Body() dto: CreateNotificationDto) {
    return this.service.create(dto);
  }
}
