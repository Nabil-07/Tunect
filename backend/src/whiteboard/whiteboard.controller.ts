import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WhiteboardService } from './whiteboard.service';

@ApiTags('whiteboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('whiteboard')
export class WhiteboardController {
  constructor(private readonly whiteboardService: WhiteboardService) {}

  @Get(':bookingId')
  @ApiOperation({ summary: 'Get whiteboard data for a booking' })
  getWhiteboardData(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.whiteboardService.getWhiteboardData(bookingId, userId);
  }

  @Post(':bookingId')
  @ApiOperation({ summary: 'Save whiteboard data' })
  saveWhiteboardData(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
    @Body() data: any,
  ) {
    return this.whiteboardService.saveWhiteboardData(bookingId, userId, data);
  }

  @Post(':bookingId/export')
  @ApiOperation({ summary: 'Export whiteboard to S3' })
  exportToS3(
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.whiteboardService.exportToS3(bookingId, userId);
  }
}
