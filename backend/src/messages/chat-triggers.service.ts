// Stub service for chat triggers - simplified version
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatTriggersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create or reuse a conversation when a direct booking is created.
   *
   * Each student–tutor pair shares ONE persistent conversation thread.
   * We never create a new conversation per booking because that would hide
   * all messages exchanged before the new booking was made.
   */
  async onDirectBookingCreated(
    studentId: string,
    tutorId: string,
    bookingId: string,
  ): Promise<void> {
    // Check whether a conversation already exists for this student–tutor pair.
    const existing = await this.prisma.conversation.findFirst({
      where: { studentId, tutorId },
      select: { id: true },
    });

    // If one already exists, reuse it — do not open a new (empty) thread.
    if (existing) return;

    // No conversation yet: create a single, persistent general conversation.
    // bookingId is intentionally null so it is not re-created on future bookings.
    await this.prisma.conversation.create({
      data: { studentId, tutorId, bookingId: null },
    });
  }

  /**
   * Handle when a group session booking is created
   */
  async onGroupSessionCreated(bookingId: string): Promise<void> {
    // Placeholder for group session chat creation
    // Not implemented in current simplified schema
  }

  /**
   * Handle when a student leaves a group session
   */
  async onStudentLeftGroupSession(
    userId: string,
    bookingId: string,
  ): Promise<void> {
    // Placeholder for handling student leaving
    // Not implemented in current simplified schema
  }
}
