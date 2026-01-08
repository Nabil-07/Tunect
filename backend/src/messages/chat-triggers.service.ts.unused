// src/messages/chat-triggers.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationType, ConversationMemberRole } from '@prisma/client';

@Injectable()
export class ChatTriggersService {
  private readonly logger = new Logger(ChatTriggersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * AUTO-TRIGGER: Create GROUP_SESSION conversation when group booking is made
   */
  async onGroupBookingCreated(bookingId: string, tutorUserId: string, studentUserId: string) {
    try {
      // Check if conversation already exists for this booking
      const existing = await this.prisma.conversation.findFirst({
        where: {
          type: ConversationType.GROUP_SESSION,
          referenceId: bookingId,
        },
      });

      if (existing) {
        // Just add the student as a new member
        await this.prisma.conversationMember.upsert({
          where: {
            conversationId_userId: {
              conversationId: existing.id,
              userId: studentUserId,
            },
          },
          create: {
            conversationId: existing.id,
            userId: studentUserId,
            role: ConversationMemberRole.MEMBER,
          },
          update: {
            leftAt: null, // Rejoin if previously left
          },
        });

        this.logger.log(`Added student to existing group chat: ${existing.id}`);
        return existing;
      }

      // Create new GROUP_SESSION conversation
      const conversation = await this.prisma.conversation.create({
        data: {
          type: ConversationType.GROUP_SESSION,
          referenceId: bookingId,
          isActive: true,
          members: {
            create: [
              {
                userId: tutorUserId,
                role: ConversationMemberRole.ADMIN, // Tutor is admin of group chat
              },
              {
                userId: studentUserId,
                role: ConversationMemberRole.MEMBER,
              },
            ],
          },
        },
      });

      // Create system message
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: tutorUserId,
          content: '🎓 Group session chat created. Welcome!',
          text: '🎓 Group session chat created. Welcome!',
        },
      });

      this.logger.log(`Created GROUP_SESSION conversation: ${conversation.id}`);
      return conversation;
    } catch (error) {
      this.logger.error(`Failed to create group session chat: ${error}`);
      throw error;
    }
  }

  /**
   * AUTO-TRIGGER: Create DIRECT conversation when direct booking is made
   */
  async onDirectBookingCreated(bookingId: string, tutorUserId: string, studentUserId: string) {
    try {
      // Check if DIRECT conversation already exists between tutor and student
      const student = await this.prisma.student.findUnique({
        where: { userId: studentUserId },
      });
      const tutor = await this.prisma.tutor.findUnique({
        where: { userId: tutorUserId },
      });

      if (!student || !tutor) {
        throw new Error('Student or Tutor not found');
      }

      const existing = await this.prisma.conversation.findFirst({
        where: {
          type: ConversationType.DIRECT,
          OR: [
            {
              studentId: student.id,
              tutorId: tutor.id,
            },
          ],
        },
      });

      if (existing) {
        this.logger.log(`Direct conversation already exists: ${existing.id}`);
        return existing;
      }

      // Create new DIRECT conversation
      const conversation = await this.prisma.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          referenceId: bookingId,
          isActive: true,
          studentId: student.id,
          tutorId: tutor.id,
          members: {
            create: [
              {
                userId: tutorUserId,
                role: ConversationMemberRole.MEMBER,
              },
              {
                userId: studentUserId,
                role: ConversationMemberRole.MEMBER,
              },
            ],
          },
        },
      });

      this.logger.log(`Created DIRECT conversation: ${conversation.id}`);
      return conversation;
    } catch (error) {
      this.logger.error(`Failed to create direct conversation: ${error}`);
      throw error;
    }
  }

  /**
   * AUTO-TRIGGER: Remove student from group chat when booking is cancelled
   */
  async onGroupBookingCancelled(bookingId: string, studentUserId: string) {
    try {
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          type: ConversationType.GROUP_SESSION,
          referenceId: bookingId,
        },
      });

      if (!conversation) {
        this.logger.warn(`No conversation found for booking: ${bookingId}`);
        return;
      }

      // Mark member as left
      await this.prisma.conversationMember.updateMany({
        where: {
          conversationId: conversation.id,
          userId: studentUserId,
        },
        data: {
          leftAt: new Date(),
        },
      });

      // Create system message
      const user = await this.prisma.user.findUnique({
        where: { id: studentUserId },
        select: { name: true, email: true },
      });

      const tutorMember = await this.prisma.conversationMember.findFirst({
        where: {
          conversationId: conversation.id,
          role: ConversationMemberRole.ADMIN,
        },
      });

      if (tutorMember) {
        await this.prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: tutorMember.userId,
            content: `${user?.name || user?.email || 'A student'} has left the group session.`,
            text: `${user?.name || user?.email || 'A student'} has left the group session.`,
          },
        });
      }

      this.logger.log(`Removed student from group chat: ${conversation.id}`);
    } catch (error) {
      this.logger.error(`Failed to remove student from group chat: ${error}`);
    }
  }

  /**
   * AUTO-TRIGGER: Archive conversation when all members leave
   */
  async checkAndArchiveConversation(conversationId: string) {
    try {
      const activeMembers = await this.prisma.conversationMember.count({
        where: {
          conversationId,
          leftAt: null,
        },
      });

      if (activeMembers === 0) {
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { isActive: false },
        });

        this.logger.log(`Archived conversation: ${conversationId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to archive conversation: ${error}`);
    }
  }

  /**
   * UTILITY: Get or create DIRECT conversation
   */
  async getOrCreateDirectConversation(tutorUserId: string, studentUserId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId: studentUserId },
    });
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId: tutorUserId },
    });

    if (!student || !tutor) {
      throw new Error('Student or Tutor not found');
    }

    // Check if conversation exists
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        studentId: student.id,
        tutorId: tutor.id,
      },
      include: {
        members: {
          where: { leftAt: null },
        },
      },
    });

    if (!conversation) {
      // Create new conversation
      conversation = await this.prisma.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          isActive: true,
          studentId: student.id,
          tutorId: tutor.id,
          members: {
            create: [
              {
                userId: tutorUserId,
                role: ConversationMemberRole.MEMBER,
              },
              {
                userId: studentUserId,
                role: ConversationMemberRole.MEMBER,
              },
            ],
          },
        },
        include: {
          members: {
            where: { leftAt: null },
          },
        },
      });
    }

    return conversation;
  }
}
