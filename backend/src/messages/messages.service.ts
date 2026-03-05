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
import { PiiGuardService } from '../common/pii-guard.service';
import { Role as DbRole } from '@prisma/client';
import { MessagesGateway } from './messages.gateway';

const MAX_MESSAGE_LEN = 2000;
const THREAD_PAGE_SIZE = 50;
const CONVO_PAGE_SIZE_DEFAULT = 20;

@Injectable()
export class MessagesService {
  // In-memory read tracking: Map<`${userId}:${conversationId}`, Date>
  // Tracks when a user last read a conversation (no schema migration needed)
  private readonly readReceipts = new Map<string, Date>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly piiGuard: PiiGuardService,
    private readonly gateway: MessagesGateway,
  ) {}

  async post(dto: PostMessageDto) {
    const userId = this.ctx.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');

    const existingStrikes = await this.prisma.piiViolationLog.count({ where: { userId } });
    const maxStrikes = 3;
    if (existingStrikes >= maxStrikes) {
      throw new ForbiddenException({
        message: 'Your account is blocked from messaging due to repeated personal-info violations.',
        code: 'PII_ACCOUNT_BLOCKED',
        strikes: existingStrikes,
        maxStrikes,
      });
    }

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
        isBanned: true,
        bannedScope: true,
        student: { select: { id: true } },
        tutor: { select: { id: true } },
      },
    });
    if (!me) throw new ForbiddenException('User not found');

    if (me.isBanned && (me.bannedScope === 'ALL' || me.bannedScope === 'MESSAGING')) {
      throw new ForbiddenException({
        message: 'Your account is banned from messaging.',
        code: 'ACCOUNT_BANNED',
        scope: me.bannedScope,
      });
    }

    // PII DETECTION - Block messages with personal information
    const piiResult = this.piiGuard.detectPii(text);
    
    if (!piiResult.isClean) {
      const violationCount = existingStrikes + 1;

      await this.prisma.piiViolationLog.create({
        data: {
          userId,
          messageContent: text,
          violationType: piiResult.violations.map(v => v.type).join(', '),
          detectedPatterns: JSON.stringify(piiResult.violations),
          action: violationCount >= maxStrikes ? 'ACCOUNT_BLOCKED' : 'BLOCKED',
        },
      });

      // Ban user and forfeit funds after 3rd violation
      if (violationCount >= maxStrikes && !me.isBanned) {
        // Update user ban status
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            isBanned: true,
            bannedScope: 'ALL',
            bannedAt: new Date(),
          },
        });

        // Create ban ledger entry
        const banLedger = await this.prisma.banLedger.create({
          data: {
            userId,
            actorId: userId, // Self-ban from automated system
            actorRole: 'ADMIN',
            scope: 'ALL',
            reason: 'PII_VIOLATION',
            note: `Automatically banned after ${violationCount} PII violations. Attempted to share: ${piiResult.violations.map(v => v.type).join(', ')}`,
            isActive: true,
          },
        });

        // Forfeit tutor earnings
        if (me.role === 'TUTOR' && me.tutor) {
          const tutorWallet = await this.prisma.tutorWallet.findUnique({
            where: { tutorId: me.tutor.id },
            select: { balance: true },
          });

          if (tutorWallet && tutorWallet.balance.toNumber() > 0) {
            // Create forfeiture record
            await this.prisma.banForfeitureLedger.create({
              data: {
                userId,
                amount: tutorWallet.balance,
                type: 'TUTOR_EARNING_FORFEIT',
                banLedgerId: banLedger.id,
              },
            });

            // Zero out tutor wallet
            await this.prisma.tutorWallet.update({
              where: { tutorId: me.tutor.id },
              data: { balance: 0 },
            });

            // Record in wallet ledger
            await this.prisma.tutorWalletLedger.create({
              data: {
                tutorId: me.tutor.id,
                delta: tutorWallet.balance.mul(-1),
                reason: 'FORFEITED',
                note: `Earnings forfeited due to PII violations (Ban ID: ${banLedger.id})`,
              },
            });
          }
        }

        // Forfeit student tokens
        if (me.role === 'STUDENT' && me.student) {
          const studentTokens = await this.prisma.tutorTokenBalance.findMany({
            where: { studentId: me.student.id },
            select: { id: true, tutorId: true, balance: true, pricePerToken: true },
          });

          let totalForfeited = 0;
          for (const tokenBalance of studentTokens) {
            if (tokenBalance.balance.toNumber() > 0) {
              const amountValue = tokenBalance.balance.mul(tokenBalance.pricePerToken);
              totalForfeited += amountValue.toNumber();

              // Zero out token balance
              await this.prisma.tutorTokenBalance.update({
                where: { id: tokenBalance.id },
                data: { balance: 0 },
              });
            }
          }

          if (totalForfeited > 0) {
            // Create forfeiture record
            await this.prisma.banForfeitureLedger.create({
              data: {
                userId,
                amount: totalForfeited,
                type: 'STUDENT_TOKEN_FORFEIT',
                banLedgerId: banLedger.id,
              },
            });
          }
        }
      }

      const warningMessage = this.piiGuard.getWarningMessage(me.role as 'STUDENT' | 'TUTOR');
      const remaining = Math.max(0, maxStrikes - violationCount);

      throw new ForbiddenException({
        message: `${warningMessage}`,
        code: violationCount >= maxStrikes ? 'PII_ACCOUNT_BLOCKED' : 'PII_WARNING',
        strikes: violationCount,
        maxStrikes,
        remaining,
      });
    }

    const convo = await this.resolveConversation(
      dto,
      me.id,
      me.role as DbRole,
      me.student?.id,
      me.tutor?.id,
    );

    // Get full conversation details to check token balance
    const fullConvo = await this.prisma.conversation.findUnique({
      where: { id: convo.id },
      select: {
        id: true,
        studentId: true,
        tutorId: true,
        student: { select: { id: true } },
        tutor: { select: { id: true } },
      },
    });
    if (!fullConvo) throw new NotFoundException('Conversation not found');

    // Validate token balance before allowing message sending
    await this.validateTokenBalanceForMessaging(
      fullConvo.studentId,
      fullConvo.tutorId,
      me.role as DbRole,
    );

    await this.ensureParticipant(convo.id, me.id);

    const participantUserIds = await this.getParticipantUserIds(convo.id);

    const created = await this.prisma.message.create({
      data: { conversationId: convo.id, senderId: me.id, text },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        text: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const payload = {
      id: created.id,
      conversationId: created.conversationId,
      senderId: created.senderId,
      content: created.text,
      isDeleted: false,
      createdAt: created.createdAt.toISOString(),
      sender: {
        id: created.user.id,
        name: created.user.name,
        email: created.user.email,
      },
    };

    // Emit realtime message to both participants
    await this.gateway.emitNewMessage(convo.id, payload);
    participantUserIds.forEach((uid) => {
      this.gateway.emitConversationUpdate(uid, {
        conversationId: convo.id,
        lastMessage: payload,
        fromUserId: me.id,
      });
    });

    return payload;
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
        student: { 
          select: { 
            id: true,
            userId: true,
            user: { select: { id: true, name: true, email: true } }
          } 
        },
        tutor: { 
          select: { 
            id: true,
            userId: true,
            user: { select: { id: true, name: true, email: true } }
          } 
        },
        booking: {
          select: {
            id: true,
            status: true,
          }
        },
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

    // Determine participant name
    const [student, tutor] = await Promise.all([
      this.prisma.student.findUnique({ where: { userId } }),
      this.prisma.tutor.findUnique({ where: { userId } }),
    ]);
    
    const isStudent = student && convo.student.id === student.id;
    const otherParticipant = isStudent ? convo.tutor : convo.student;
    const otherParticipantName = otherParticipant?.user?.name || 'Unknown User';

    const take = THREAD_PAGE_SIZE;

    const messages = await this.prisma.message.findMany({
      where: { conversationId: id },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { 
        id: true, 
        senderId: true, 
        text: true, 
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      },
    });

    const nextCursor = messages.length === take ? messages[messages.length - 1].id : null;

    const memberRecords = [
      convo.student
        ? {
            id: convo.student.id,
            userId: convo.student.userId,
            role: 'MEMBER' as const,
            joinedAt: convo.createdAt.toISOString(),
            user: {
              id: convo.student.user.id,
              email: convo.student.user.email,
              name: convo.student.user.name,
              role: 'STUDENT',
            },
          }
        : null,
      convo.tutor
        ? {
            id: convo.tutor.id,
            userId: convo.tutor.userId,
            role: 'MEMBER' as const,
            joinedAt: convo.createdAt.toISOString(),
            user: {
              id: convo.tutor.user.id,
              email: convo.tutor.user.email,
              name: convo.tutor.user.name,
              role: 'TUTOR',
            },
          }
        : null,
    ].filter(Boolean);

    const isActive =
      !convo.booking ||
      (convo.booking.status !== 'CANCELED' && convo.booking.status !== 'COMPLETED');

    // Check token balance for this student-tutor pair
    const tokenBalance = await this.prisma.tutorTokenBalance.findUnique({
      where: {
        studentId_tutorId: {
          studentId: convo.student.id,
          tutorId: convo.tutor.id,
        },
      },
      select: {
        balance: true,
      },
    });

    const balance = tokenBalance?.balance.toNumber() ?? 0;
    const hasTokens = balance > 0;

    return {
      id: convo.id,
      type: 'DIRECT' as const,
      name: otherParticipantName,
      referenceId: convo.bookingId ?? null,
      isActive,
      createdAt: convo.createdAt.toISOString(),
      members: memberRecords,
      tokenBalance: {
        balance,
        hasTokens,
      },
      canPost: hasTokens, // Only allow posting if tokens are available
      messages: messages.reverse().map((msg) => ({
        id: msg.id,
        conversationId: convo.id,
        senderId: msg.senderId,
        content: msg.text,
        isDeleted: false,
        createdAt: msg.createdAt.toISOString(),
        sender: {
          id: msg.user.id,
          name: msg.user.name,
          email: msg.user.email,
        },
      })),
      nextCursor,
    };
  }

  async listConversations(userId: string, cursor?: string, limit = CONVO_PAGE_SIZE_DEFAULT) {
    if (!userId) throw new ForbiddenException('Not authenticated');

    const [student, tutor] = await Promise.all([
      this.prisma.student.findUnique({ where: { userId } }),
      this.prisma.tutor.findUnique({ where: { userId } }),
    ]);

    await this.ensureConversationsForUser(student?.id, tutor?.id);

    const ors: Array<Record<string, any>> = [];
    if (student) ors.push({ studentId: student.id });
    if (tutor) ors.push({ tutorId: tutor.id });

    if (ors.length === 0) {
      return { items: [], nextCursor: null };
    }

    const where: any = { 
      OR: ors,
      isArchived: false, // Only show non-archived conversations
    };
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
        student: { 
          select: { 
            id: true, 
            userId: true,
            user: { select: { id: true, email: true, name: true } } 
          } 
        },
        tutor: { 
          select: { 
            id: true, 
            userId: true,
            user: { select: { id: true, email: true, name: true } } 
          } 
        },
        booking: {
          select: {
            id: true,
            status: true,
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { 
            id: true, 
            text: true, 
            createdAt: true, 
            senderId: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const seenByOtherUser = new Set<string>();
    const items = page.reduce<Array<Record<string, any>>>((acc, c) => {
      const isStudent = student && c.student.id === student.id;
      const otherParticipant = isStudent ? c.tutor : c.student;
      const otherParticipantName = otherParticipant?.user?.name || 'Unknown User';

      const otherUserId = otherParticipant?.userId || otherParticipant?.user?.id || c.id;
      if (seenByOtherUser.has(otherUserId)) return acc;
      seenByOtherUser.add(otherUserId);

      const isActive =
        !c.booking ||
        (c.booking.status !== 'CANCELED' && c.booking.status !== 'COMPLETED');

      // Compute per-conversation unread count
      const lastMsg = c.messages[0] ?? null;
      let unreadCount = 0;
      if (lastMsg && lastMsg.senderId !== userId) {
        const readAt = this.readReceipts.get(`${userId}:${c.id}`);
        if (!readAt || readAt < lastMsg.createdAt) {
          unreadCount = 1;
        }
      }

      acc.push({
        id: c.id,
        type: 'DIRECT' as const,
        name: otherParticipantName,
        referenceId: c.bookingId,
        isActive,
        memberCount: 2,
        unreadCount,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              content: lastMsg.text,
              isDeleted: false,
              createdAt: lastMsg.createdAt.toISOString(),
              senderId: lastMsg.senderId,
            }
          : null,
        createdAt: c.createdAt.toISOString(),
      });

      return acc;
    }, []);

    // Sort by most recent message first (fall back to conversation createdAt)
    items.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].createdAt.toISOString() : null;

    return { items, nextCursor };
  }

  private async ensureConversationsForUser(studentId?: string, tutorId?: string) {
    if (!studentId && !tutorId) return;

    const since = new Date();
    since.setDate(since.getDate() - 180);

    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [
          studentId ? { studentId } : undefined,
          tutorId ? { tutorId } : undefined,
        ].filter(Boolean) as Array<Record<string, any>>,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: since },
      },
      select: { id: true, studentId: true, tutorId: true },
      take: 200,
    });

    if (!bookings.length) return;

    await this.prisma.conversation.createMany({
      data: bookings.map((booking) => ({
        studentId: booking.studentId,
        tutorId: booking.tutorId,
        bookingId: booking.id,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * List archived conversations
   */
  async listArchivedConversations(userId: string, cursor?: string, limit = CONVO_PAGE_SIZE_DEFAULT) {
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

    const where: any = { 
      OR: ors,
      isArchived: true, // Only show archived conversations
    };
    if (cursor) {
      const dt = new Date(cursor);
      if (!isNaN(dt.getTime())) {
        where.archivedAt = { lt: dt };
      }
    }

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: { archivedAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)) + 1,
      select: {
        id: true,
        bookingId: true,
        createdAt: true,
        archivedAt: true,
        student: { 
          select: { 
            id: true, 
            userId: true,
            user: { select: { id: true, email: true, name: true } } 
          } 
        },
        tutor: { 
          select: { 
            id: true, 
            userId: true,
            user: { select: { id: true, email: true, name: true } } 
          } 
        },
        booking: {
          select: {
            id: true,
            status: true,
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { 
            id: true, 
            text: true, 
            createdAt: true, 
            senderId: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items = page.map((c) => {
      const isStudent = student && c.student.id === student.id;
      const otherParticipant = isStudent ? c.tutor : c.student;
      const otherParticipantName = otherParticipant?.user?.name || 'Unknown User';

      const isActive = !c.booking || 
                       (c.booking.status !== 'CANCELED' && c.booking.status !== 'COMPLETED');

      return {
        id: c.id,
        type: 'DIRECT' as const,
        name: otherParticipantName,
        referenceId: c.bookingId,
        isActive,
        memberCount: 2,
        lastMessage: c.messages[0] ? {
          id: c.messages[0].id,
          content: c.messages[0].text,
          isDeleted: false,
          createdAt: c.messages[0].createdAt.toISOString(),
          senderId: c.messages[0].senderId,
        } : null,
        createdAt: c.createdAt.toISOString(),
        archivedAt: c.archivedAt?.toISOString(),
      };
    });

    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].archivedAt : null;

    return { items, nextCursor };
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string, userId: string) {
    if (!userId) throw new ForbiddenException('Not authenticated');

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        student: { select: { userId: true } },
        tutor: { select: { userId: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Verify user is part of this conversation
    if (conversation.student.userId !== userId && conversation.tutor.userId !== userId) {
      throw new ForbiddenException('You are not part of this conversation');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        isArchived: true,
        archivedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Unarchive a conversation
   */
  async unarchiveConversation(conversationId: string, userId: string) {
    if (!userId) throw new ForbiddenException('Not authenticated');

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        student: { select: { userId: true } },
        tutor: { select: { userId: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Verify user is part of this conversation
    if (conversation.student.userId !== userId && conversation.tutor.userId !== userId) {
      throw new ForbiddenException('You are not part of this conversation');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        isArchived: false,
        archivedAt: null,
      },
    });

    return { success: true };
  }

  /**
   * Mark a conversation as read for the given user.
   * Also marks all sibling conversations (same student-tutor pair) as read,
   * since the UI deduplicates conversations by the other participant.
   */
  async markThreadRead(conversationId: string, userId: string) {
    if (!userId) throw new ForbiddenException('Not authenticated');
    const now = new Date();
    this.readReceipts.set(`${userId}:${conversationId}`, now);

    // Also mark all sibling conversations (same student-tutor pair)
    try {
      const convo = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { studentId: true, tutorId: true },
      });
      if (convo) {
        const siblings = await this.prisma.conversation.findMany({
          where: { studentId: convo.studentId, tutorId: convo.tutorId },
          select: { id: true },
        });
        for (const s of siblings) {
          this.readReceipts.set(`${userId}:${s.id}`, now);
        }
      }
    } catch {
      // Non-critical: the primary receipt was already set
    }
    return { success: true as const };
  }

  /**
   * Count conversations with unread messages.
   * A conversation is "unread" if:
   *   - It has a last message sent by someone else, AND
   *   - The user hasn't marked it as read since that message was sent
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
          select: { id: true, senderId: true, createdAt: true },
        },
      },
    });

    // Deduplicate by other participant (matches listConversations UI behavior)
    const seen = new Set<string>();
    const count = convos.reduce((acc, c) => {
      const last = c.messages[0];
      if (!last || last.senderId === userId) return acc;

      // Check if user has read this conversation after the last message
      const readAt = this.readReceipts.get(`${userId}:${c.id}`);
      if (readAt && readAt >= last.createdAt) return acc;

      // Deduplicate: only count once per other participant
      const otherId = last.senderId;
      if (seen.has(otherId)) return acc;
      seen.add(otherId);

      return acc + 1;
    }, 0);

    return { count };
  }

  // ---------- helpers ----------
  /**
   * Validates that the student has available tokens for the tutor before allowing messaging.
   * Both student and tutor can only send messages if the student has tokens allocated for that tutor.
   */
  private async validateTokenBalanceForMessaging(
    studentId: string,
    tutorId: string,
    senderRole: DbRole,
  ) {
    // Check if student has tokens available for this tutor
    const tokenBalance = await this.prisma.tutorTokenBalance.findUnique({
      where: {
        studentId_tutorId: {
          studentId,
          tutorId,
        },
      },
      select: {
        balance: true,
      },
    });

    // If no token balance record exists OR balance is 0 or negative, block messaging
    if (!tokenBalance || tokenBalance.balance.toNumber() <= 0) {
      const tutor = await this.prisma.tutor.findUnique({
        where: { id: tutorId },
        include: { user: { select: { name: true } } },
      });
      const tutorName = tutor?.user?.name || 'this tutor';

      throw new ForbiddenException({
        message: `You cannot send messages to ${tutorName} because you don't have any available tokens. Please purchase tokens to continue messaging.`,
        code: 'INSUFFICIENT_TOKENS',
        studentId,
        tutorId,
        balance: tokenBalance?.balance.toNumber() ?? 0,
      });
    }
  }

  private async resolveConversation(
    dto: PostMessageDto,
    userId: string,
    role: DbRole,
    myStudentId?: string,
    myTutorId?: string,
  ) {
    if (dto.conversationId) {
      const convo = await this.prisma.conversation.findUnique({
        where: { id: dto.conversationId },
        select: {
          id: true,
          student: { select: { userId: true } },
          tutor: { select: { userId: true } },
        },
      });
      if (!convo) throw new NotFoundException('Conversation not found');
      if (convo.student?.userId !== userId && convo.tutor?.userId !== userId) {
        throw new ForbiddenException('You are not a participant of this conversation');
      }
      return { id: convo.id };
    }

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

  private async getParticipantUserIds(conversationId: string): Promise<string[]> {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        student: { select: { userId: true } },
        tutor: { select: { userId: true } },
      },
    });
    if (!convo) return [];
    return [convo.student?.userId, convo.tutor?.userId].filter(Boolean) as string[];
  }

  // ─── Admin Broadcast & Private Messaging ────────────────────────────

  /**
   * Send an announcement to all tutors or tutors filtered by subject.
   * Creates an AdminBroadcast record and fans out Notification records.
   */
  async sendBroadcast(senderId: string, message: string, subject?: string) {
    if (!message.trim()) throw new BadRequestException('Message is required');

    // Fetch target tutors
    const where: any = { status: 'APPROVED' };
    if (subject && subject.trim()) {
      where.subjects = { has: subject.trim() };
    }

    const tutors = await this.prisma.tutor.findMany({
      where,
      select: { id: true, userId: true, user: { select: { name: true } } },
    });

    if (tutors.length === 0) {
      throw new BadRequestException(
        subject ? `No approved tutors found for subject "${subject}"` : 'No approved tutors found',
      );
    }

    // Create broadcast record
    const broadcast = await this.prisma.adminBroadcast.create({
      data: {
        senderId,
        subject: subject?.trim() || null,
        message: message.trim(),
        recipientCount: tutors.length,
      },
    });

    // Create notifications for each tutor
    const title = subject?.trim()
      ? `📢 Announcement for ${subject.trim()} tutors`
      : '📢 Announcement for all tutors';

    await this.prisma.notification.createMany({
      data: tutors.map((t) => ({
        userId: t.userId,
        title,
        message: message.trim(),
        type: 'SYSTEM' as any,
      })),
    });

    return {
      ok: true,
      broadcastId: broadcast.id,
      recipientCount: tutors.length,
      message: `Broadcast sent to ${tutors.length} tutor(s)`,
    };
  }

  /**
   * Send a private message from admin to a specific user (tutor).
   * Creates an AdminPrivateMessage record + a Notification.
   */
  async sendPrivateMessage(senderId: string, recipientId: string, message: string) {
    if (!message.trim()) throw new BadRequestException('Message is required');

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, name: true, email: true, deletedAt: true },
    });
    if (!recipient) throw new NotFoundException('Recipient not found');
    if (recipient.deletedAt) throw new BadRequestException('Cannot message a deleted account');

    // Create private message record
    const pm = await this.prisma.adminPrivateMessage.create({
      data: {
        senderId,
        recipientId,
        message: message.trim(),
      },
    });

    // Create notification for recipient
    await this.prisma.notification.create({
      data: {
        userId: recipientId,
        title: '✉️ Private message from Admin',
        message: message.trim(),
        type: 'SYSTEM' as any,
      },
    });

    return {
      ok: true,
      messageId: pm.id,
      recipientName: recipient.name || recipient.email,
    };
  }

  /**
   * List broadcast history for admin view.
   */
  async listBroadcasts(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.adminBroadcast.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          sender: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.adminBroadcast.count(),
    ]);

    return {
      items: items.map((b) => ({
        id: b.id,
        subject: b.subject,
        message: b.message,
        recipientCount: b.recipientCount,
        sender: b.sender,
        createdAt: b.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * List private message history for admin view.
   */
  async listPrivateMessages(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.adminPrivateMessage.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          sender: { select: { id: true, name: true, email: true } },
          recipient: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.adminPrivateMessage.count(),
    ]);

    return {
      items: items.map((m) => ({
        id: m.id,
        message: m.message,
        sender: m.sender,
        recipient: m.recipient,
        createdAt: m.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get distinct subjects from all approved tutors.
   */
  async getDistinctSubjects(): Promise<string[]> {
    const tutors = await this.prisma.tutor.findMany({
      where: { status: 'APPROVED' },
      select: { subjects: true },
    });
    const allSubjects = new Set<string>();
    tutors.forEach((t) => t.subjects.forEach((s) => allSubjects.add(s)));
    return Array.from(allSubjects).sort();
  }

  /**
   * Get admin messages received by the current user.
   * - Private messages where recipientId = userId
   * - Broadcasts applicable to this tutor (subject matches or null = all)
   * Sender is always shown as "Admin".
   */
  async getMyAdminMessages(userId: string) {
    // Fetch private messages sent directly to this user
    const privateMessages = await this.prisma.adminPrivateMessage.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, message: true, createdAt: true },
    });

    // Check if user is a tutor to determine broadcast eligibility
    const tutorProfile = await this.prisma.tutor.findUnique({
      where: { userId },
      select: { subjects: true },
    });

    let broadcastMessages: any[] = [];
    if (tutorProfile) {
      const subjects = tutorProfile.subjects;
      broadcastMessages = await this.prisma.adminBroadcast.findMany({
        where: {
          OR: [
            { subject: null },
            ...(subjects.length > 0
              ? subjects.map((s) => ({ subject: s }))
              : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, message: true, subject: true, createdAt: true },
      });
    }

    // Combine and sort by date descending
    const combined = [
      ...privateMessages.map((m) => ({
        id: m.id,
        type: 'PRIVATE' as const,
        subject: null as string | null,
        message: m.message,
        senderName: 'Admin',
        createdAt: m.createdAt.toISOString(),
      })),
      ...broadcastMessages.map((m) => ({
        id: m.id,
        type: 'BROADCAST' as const,
        subject: m.subject as string | null,
        message: m.message,
        senderName: 'Admin',
        createdAt: m.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return combined;
  }
}
