import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIService } from '../common/services/openai.service';
import { CreateSessionNoteDto } from './dto/create-session-note.dto';
import { UpdateSessionNoteDto } from './dto/update-session-note.dto';

@Injectable()
export class SessionNotesService {
  constructor(
    private prisma: PrismaService,
    private openaiService: OpenAIService,
  ) {}

  async create(bookingId: string, authorId: string, dto: CreateSessionNoteDto) {
    // Verify booking exists and user is the tutor
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { tutor: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.tutor.userId !== authorId) {
      throw new ForbiddenException('Only the tutor can create session notes');
    }

    return this.prisma.sessionNote.create({
      data: {
        bookingId,
        authorId,
        content: dto.content,
        isAiGenerated: dto.aiGenerated || false,
        approvedByTutor: dto.aiGenerated ? false : true, // Auto-approve manual notes
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        booking: {
          include: {
            student: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findByBooking(bookingId: string) {
    return this.prisma.sessionNote.findMany({
      where: { bookingId },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findStudentNotes(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return [];
    }

    return this.prisma.sessionNote.findMany({
      where: {
        booking: {
          studentId: student.id,
        },
        approvedByTutor: true, // Only show approved notes
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        booking: {
          select: {
            id: true,
            startTime: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveNote(noteId: string, userId: string) {
    const note = await this.prisma.sessionNote.findUnique({
      where: { id: noteId },
      include: {
        booking: {
          include: {
            tutor: true,
          },
        },
      },
    });

    if (!note) {
      throw new NotFoundException('Session note not found');
    }

    // Only tutor can approve their AI-generated notes
    if (note.booking.tutor.userId !== userId) {
      throw new ForbiddenException('Only the tutor can approve this note');
    }

    return this.prisma.sessionNote.update({
      where: { id: noteId },
      data: { approvedByTutor: true },
    });
  }

  async update(noteId: string, userId: string, dto: UpdateSessionNoteDto) {
    const note = await this.prisma.sessionNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new NotFoundException('Session note not found');
    }

    if (note.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own notes');
    }

    return this.prisma.sessionNote.update({
      where: { id: noteId },
      data: {
        content: dto.content,
      },
    });
  }

  async delete(noteId: string, userId: string) {
    const note = await this.prisma.sessionNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new NotFoundException('Session note not found');
    }

    if (note.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own notes');
    }

    return this.prisma.sessionNote.delete({
      where: { id: noteId },
    });
  }

  /**
   * Generate AI session notes for a completed booking
   */
  async generateAISessionNotes(bookingId: string, userId: string) {
    // Verify booking exists and is completed
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tutor: true,
        student: {
          include: {
            user: true,
          },
        },
        conversations: {
          include: {
            messages: {
              take: 50,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        sessionNotes: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.tutor.userId !== userId) {
      throw new ForbiddenException('Only the tutor can generate AI notes');
    }

    if (booking.status !== 'COMPLETED') {
      throw new ForbiddenException('Can only generate notes for completed sessions');
    }

    // Check if booking was paid (prevent abuse)
    if (!booking.tokensCharged || booking.tokensCharged.toNumber() === 0) {
      throw new ForbiddenException('AI notes are only available for paid sessions');
    }

    // Gather session context
    const chatMessages = booking.conversations[0]?.messages.map(
      (msg) => msg.text,
    ) || [];

    const existingNotes = booking.sessionNotes.find((note) => !note.isAiGenerated);

    const duration = booking.startTime && booking.endTime
      ? Math.round((booking.endTime.getTime() - booking.startTime.getTime()) / (1000 * 60))
      : undefined;

    // Generate AI summary
    const aiResult = await this.openaiService.generateSessionNotes({
      chatMessages: chatMessages.filter((msg): msg is string => msg !== null),
      tutorNotes: existingNotes?.content,
      sessionTopic: booking.notes || undefined,
      duration,
    });

    // Create or update AI-generated note
    const existingAiNote = booking.sessionNotes.find((note) => note.isAiGenerated);

    if (existingAiNote) {
      return this.prisma.sessionNote.update({
        where: { id: existingAiNote.id },
        data: {
          aiSummary: aiResult.aiSummary,
          keyPoints: aiResult.keyPoints.join('\n'),
          homeworkSuggestions: aiResult.homeworkSuggestions.join('\n'),
          approvedByTutor: false, // Reset approval
        },
      });
    }

    return this.prisma.sessionNote.create({
      data: {
        bookingId,
        authorId: userId,
        content: 'AI-generated session summary',
        aiSummary: aiResult.aiSummary,
        keyPoints: aiResult.keyPoints.join('\n'),
        homeworkSuggestions: aiResult.homeworkSuggestions.join('\n'),
        isAiGenerated: true,
        approvedByTutor: false,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Approve AI-generated notes
   */
  async approveAINotes(noteId: string, userId: string) {
    const note = await this.prisma.sessionNote.findUnique({
      where: { id: noteId },
      include: {
        booking: {
          include: { tutor: true },
        },
      },
    });

    if (!note) {
      throw new NotFoundException('Session note not found');
    }

    if (note.booking.tutor.userId !== userId) {
      throw new ForbiddenException('Only the tutor can approve notes');
    }

    return this.prisma.sessionNote.update({
      where: { id: noteId },
      data: { approvedByTutor: true },
    });
  }
}
