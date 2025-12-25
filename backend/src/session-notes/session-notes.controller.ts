import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SessionNotesService } from './session-notes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSessionNoteDto } from './dto/create-session-note.dto';
import { UpdateSessionNoteDto } from './dto/update-session-note.dto';

@ApiTags('session-notes')
@ApiBearerAuth()
@Controller('session-notes')
@UseGuards(JwtAuthGuard)
export class SessionNotesController {
  constructor(private readonly service: SessionNotesService) {}

  @Post('booking/:bookingId')
  async createNote(
    @Param('bookingId') bookingId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSessionNoteDto,
  ) {
    return this.service.create(bookingId, userId, dto);
  }

  @Get('booking/:bookingId')
  async getNotesByBooking(@Param('bookingId') bookingId: string) {
    return this.service.findByBooking(bookingId);
  }

  @Get('my-notes')
  async getMyNotes(@CurrentUser('sub') userId: string) {
    return this.service.findStudentNotes(userId);
  }

  @Put(':noteId/approve')
  async approveNote(
    @Param('noteId') noteId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.approveNote(noteId, userId);
  }

  @Put(':noteId')
  async updateNote(
    @Param('noteId') noteId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateSessionNoteDto,
  ) {
    return this.service.update(noteId, userId, dto);
  }

  @Delete(':noteId')
  async deleteNote(
    @Param('noteId') noteId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.delete(noteId, userId);
  }
}
