// src/messages/messages.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContext } from '../common/request-context';
import { PostMessageDto } from './dto/post-message.dto';
import { Role as DbRole } from '@prisma/client';

const MAX_MESSAGE_LEN = 2000;
const THREAD_PAGE_SIZE = 50;
const CONVO_PAGE_SIZE_DEFAULT = 20;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
  ) {}

  async post(dto: PostMessageDto) {
    const userId = this.ctx.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');

    const text = (dto.text ?? '').trim();
    if (!text) throw new BadRequestException('Message text is required');
    if (text.length > MAX_MESSAGE_LEN) {
      throw new BadRequestException(`Message too long (max ${MAX_MESSAGE_LEN} chars)`);
    }

    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        student: { select: { id: true } },
        tutor: { select: { id: true } },
      },
    });
    if (!me) throw new ForbiddenException('User not found');

    const convo = await this.resolveConversation(
      dto,
      me.id,
      me.role as DbRole,
      me.student?.id,
      me.tutor?.id,
    );

    await this.ensureParticipant(convo.id, me.id);

    return this.prisma.message.create({
      data: { conversationId: convo.id, senderId: me.id, text, content: text },
      select: { id: true, conversationId: true, senderId: true, text: true, createdAt: true },
    });
  }

  async getThread(id: string, cursor?: string) {
    const userId = this.ctx.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');

    const convo = await this.prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        bookingId: true,
        createdAt: true,
        student: { select: { userId: true } },
        tutor: { select: { userId: true } },
      },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    const studentUserId = convo.student?.userId;
    const tutorUserId = convo.tutor?.userId;
    if (!studentUserId || !tutorUserId) {
      throw new NotFoundException('Participants for this conversation are missing');
    }
    if (studentUserId !== userId && tutorUserId !== userId) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }

    const take = THREAD_PAGE_SIZE;

    const messages = await this.prisma.message.findMany({
      where: { conversationId: id },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, senderId: true, text: true, createdAt: true },
    });

    const nextCursor = messages.length === take ? messages[messages.length - 1].id : null;

    return {
      conversation: {
        id: convo.id,
        bookingId: convo.bookingId ?? null,
        createdAt: convo.createdAt,
      },
      messages: messages.reverse(),
      nextCursor,
    };
  }

  async listConversations(userId: string, cursor?: string, limit = CONVO_PAGE_SIZE_DEFAULT) {
    if (!userId) throw new ForbiddenException('Not authenticated');

    const [student, tutor] = await Promise.all([
      this.prisma.student.findUnique({ where: { userId } }),
      this.prisma.tutor.findUnique({ where: { userId } }),
    ]);

    const ors: Array<Record<string, any>> = [];
    if (student) ors.push({ studentId: student.id });
    if (tutor) ors.push({ tutorId: tutor.id });

    if (ors.length === 0) {
      return { items: [], nextCursor: null };
    }

    const where: any = { OR: ors };
    if (cursor) {
      const dt = new Date(cursor);
      if (!isNaN(dt.getTime())) {
        where.createdAt = { lt: dt };
      }
    }

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)) + 1,
      select: {
        id: true,
        bookingId: true,
        createdAt: true,
        student: { select: { id: true, user: { select: { id: true, email: true } } } },
        tutor: { select: { id: true, user: { select: { id: true, email: true } } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, text: true, createdAt: true, senderId: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items = page.map((c) => ({
      id: c.id,
      bookingId: c.bookingId ?? null,
      createdAt: c.createdAt,
      student: c.student ? { id: c.student.id, user: c.student.user } : null,
      tutor: c.tutor ? { id: c.tutor.id, user: c.tutor.user } : null,
      lastMessage: c.messages[0] ?? null,
    }));

    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].createdAt.toISOString() : null;

    return { items, nextCursor };
  }

  /**
   * No-op until you add a read-receipts table.
   * Kept for controller compatibility: POST /messages/threads/:id/read
   */
  async markThreadRead(_conversationId: string, userId: string) {
    if (!userId) throw new ForbiddenException('Not authenticated');
    return { success: true as const };
  }

  /**
   * Approximate unread count without extra tables:
   * Count conversations where the latest message exists AND was sent by someone else.
   */
  async getUnreadCount(userId: string) {
    if (!userId) throw new ForbiddenException('Not authenticated');

    const [student, tutor] = await Promise.all([
      this.prisma.student.findUnique({ where: { userId }, select: { id: true } }),
      this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } }),
    ]);

    const ors: Array<Record<string, any>> = [];
    if (student) ors.push({ studentId: student.id });
    if (tutor) ors.push({ tutorId: tutor.id });
    if (ors.length === 0) return { count: 0 };

    const convos = await this.prisma.conversation.findMany({
      where: { OR: ors },
      select: {
        id: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, senderId: true },
        },
      },
    });

    const count = convos.reduce((acc, c) => {
      const last = c.messages[0];
      if (last && last.senderId !== userId) return acc + 1;
      return acc;
    }, 0);

    return { count };
  }

  // ---------- helpers ----------
  private async resolveConversation(
    dto: PostMessageDto,
    userId: string,
    role: DbRole,
    myStudentId?: string,
    myTutorId?: string,
  ) {
    if (dto.bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
        select: {
          id: true,
          student: { select: { id: true, userId: true } },
          tutor: { select: { id: true, userId: true } },
        },
      });
      if (!booking) throw new BadRequestException('Booking not found');

      const isParticipant =
        booking.student.userId === userId || booking.tutor.userId === userId;
      if (!isParticipant) throw new ForbiddenException('You are not part of this booking');

      const existing = await this.prisma.conversation.findUnique({
        where: {
          studentId_tutorId_bookingId: {
            studentId: booking.student.id,
            tutorId: booking.tutor.id,
            bookingId: booking.id,
          },
        },
        select: { id: true },
      });
      if (existing) return existing;

      return this.prisma.conversation.create({
        data: {
          studentId: booking.student.id,
          tutorId: booking.tutor.id,
          bookingId: booking.id,
        },
        select: { id: true },
      });
    }

    if (!dto.peerId) throw new BadRequestException('Provide bookingId or peerId');

    if (role === DbRole.STUDENT) {
      if (!myStudentId) throw new ForbiddenException('Student profile not found');

      const tutor =
        (await this.prisma.tutor.findUnique({ where: { id: dto.peerId } })) ||
        (await this.prisma.tutor.findFirst({ where: { userId: dto.peerId } }));

      if (!tutor) throw new BadRequestException('Tutor not found');

      const existing = await this.prisma.conversation.findFirst({
        where: { studentId: myStudentId, tutorId: tutor.id, bookingId: null },
        select: { id: true },
      });
      if (existing) return existing;

      return this.prisma.conversation.create({
        data: { studentId: myStudentId, tutorId: tutor.id, bookingId: null },
        select: { id: true },
      });
    }

    if (role === DbRole.TUTOR) {
      if (!myTutorId) throw new ForbiddenException('Tutor profile not found');

      const student =
        (await this.prisma.student.findUnique({ where: { id: dto.peerId } })) ||
        (await this.prisma.student.findFirst({ where: { userId: dto.peerId } }));

      if (!student) throw new BadRequestException('Student not found');

      const existing = await this.prisma.conversation.findFirst({
        where: { studentId: student.id, tutorId: myTutorId, bookingId: null },
        select: { id: true },
      });
      if (existing) return existing;

      return this.prisma.conversation.create({
        data: { studentId: student.id, tutorId: myTutorId, bookingId: null },
        select: { id: true },
      });
    }

    throw new ForbiddenException('Admins cannot start conversations');
  }

  private async ensureParticipant(conversationId: string, userId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        student: { select: { userId: true } },
        tutor: { select: { userId: true } },
      },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    const studentUserId = convo.student?.userId;
    const tutorUserId = convo.tutor?.userId;
    if (!studentUserId || !tutorUserId) {
      throw new NotFoundException('Conversation participants missing');
    }
    if (studentUserId !== userId && tutorUserId !== userId) {
      throw new ForbiddenException('Not a participant in this conversation');
    }
  }
}
