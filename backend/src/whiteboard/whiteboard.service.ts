import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/services/s3.service';

@Injectable()
export class WhiteboardService {
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
  ) {}

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  async getWhiteboardData(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tutor: true,
        student: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Check access
    if (booking.tutor.userId !== userId && booking.student.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const whiteboard = await this.prisma.whiteboardSession.findUnique({
      where: { bookingId },
    });

    return whiteboard?.data || { elements: [], appState: {} };
  }

  async saveWhiteboardData(bookingId: string, userId: string, data: any) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tutor: true,
        student: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Check access
    if (booking.tutor.userId !== userId && booking.student.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const existing = await this.prisma.whiteboardSession.findUnique({
      where: { bookingId },
      select: { data: true },
    });

    const existingAttendance =
      this.isPlainObject(existing?.data) && this.isPlainObject((existing?.data as any).attendance)
        ? (existing?.data as any).attendance
        : null;

    const mergedData = this.isPlainObject(data)
      ? { ...data, ...(existingAttendance ? { attendance: existingAttendance } : {}) }
      : existingAttendance
        ? { attendance: existingAttendance }
        : data;

    // Upsert whiteboard data
    return this.prisma.whiteboardSession.upsert({
      where: { bookingId },
      update: {
        data: mergedData,
        updatedAt: new Date(),
      },
      create: {
        bookingId,
        data: mergedData,
      },
    });
  }

  async exportToS3(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tutor: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.tutor.userId !== userId) {
      throw new ForbiddenException('Only the tutor can export whiteboard');
    }

    const whiteboard = await this.prisma.whiteboardSession.findUnique({
      where: { bookingId },
    });

    if (!whiteboard || !whiteboard.data) {
      throw new NotFoundException('No whiteboard data to export');
    }

    // Convert JSON to buffer
    const dataBuffer = Buffer.from(JSON.stringify(whiteboard.data));

    // Upload to S3
    const s3Url = await this.s3Service.uploadFile(
      dataBuffer,
      `whiteboard-${bookingId}.json`,
      'whiteboards',
    );

    // Update whiteboard with S3 URL
    await this.prisma.whiteboardSession.update({
      where: { bookingId },
      data: {
        s3Url,
        endedAt: new Date(),
      },
    });

    return { s3Url };
  }

  /**
   * Share whiteboard content as notes — both tutor and student can view later.
   * Only the tutor can trigger this.
   * Also creates a SessionNote so it appears in the student's session notes page.
   */
  async shareAsNotes(bookingId: string, userId: string, noteName: string, wbData: any) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { tutor: true, student: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.tutor.userId !== userId) {
      throw new ForbiddenException('Only the tutor can share whiteboard notes');
    }

    // Upsert whiteboard with note info + snapshot
    const wb = await this.prisma.whiteboardSession.upsert({
      where: { bookingId },
      update: {
        data: wbData,
        noteName,
        sharedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        bookingId,
        data: wbData,
        noteName,
        sharedAt: new Date(),
      },
    });

    // Also export to S3 so we have a downloadable URL
    let s3Url: string | null = null;
    try {
      const dataBuffer = Buffer.from(JSON.stringify(wbData));
      s3Url = await this.s3Service.uploadFile(
        dataBuffer,
        `whiteboard-notes-${bookingId}.json`,
        'whiteboards',
      );
      await this.prisma.whiteboardSession.update({
        where: { bookingId },
        data: { s3Url },
      });
    } catch (err) {
      // S3 export is best-effort, don't fail the share
    }

    // Create a SessionNote record so shared notes appear in student's session notes page
    try {
      // Check if a whiteboard-based session note already exists for this booking
      const existingNote = await this.prisma.sessionNote.findFirst({
        where: {
          bookingId,
          authorId: userId,
          content: { startsWith: '📝 Whiteboard Notes:' },
        },
      });

      if (existingNote) {
        // Update existing note
        await this.prisma.sessionNote.update({
          where: { id: existingNote.id },
          data: {
            content: `📝 Whiteboard Notes: ${noteName}\n\nShared whiteboard notes from class session. View the full whiteboard in your class details.`,
          },
        });
      } else {
        // Create new session note
        await this.prisma.sessionNote.create({
          data: {
            bookingId,
            authorId: userId,
            content: `📝 Whiteboard Notes: ${noteName}\n\nShared whiteboard notes from class session. View the full whiteboard in your class details.`,
            isAiGenerated: false,
            approvedByTutor: true,
          },
        });
      }
    } catch (err) {
      // SessionNote creation is best-effort, don't fail the share
    }

    return {
      id: wb.id,
      bookingId: wb.bookingId,
      noteName: wb.noteName,
      sharedAt: wb.sharedAt,
    };
  }

  /**
   * Get shared whiteboard notes for a booking (both tutor and student can view).
   */
  async getNotes(bookingId: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tutor: { include: { user: { select: { name: true } } } },
        student: { include: { user: { select: { name: true } } } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.tutor.userId !== userId && booking.student.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const wb = await this.prisma.whiteboardSession.findUnique({
      where: { bookingId },
    });

    if (!wb || !wb.sharedAt) {
      return null; // No shared notes yet
    }

    const isTutor = booking.tutor.userId === userId;
    const classDate = booking.startTime
      ? new Date(booking.startTime).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
      : new Date(wb.sharedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

    // Name shown is counterpart name
    const counterpartName = isTutor
      ? booking.student?.user?.name || 'Student'
      : booking.tutor?.user?.name || 'Tutor';

    const displayName = wb.noteName || `ClassWhiteBoardNotes-${counterpartName}_${classDate}`;

    return {
      id: wb.id,
      bookingId: wb.bookingId,
      noteName: displayName,
      data: wb.data,
      sharedAt: wb.sharedAt,
      s3Url: wb.s3Url,
    };
  }

  /**
   * Get all shared whiteboard notes for the current user (tutor or student).
   * Returns notes from all bookings where sharedAt is set.
   */
  async getMySharedNotes(userId: string) {
    // Find all bookings where the user is tutor or student
    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [
          { tutor: { userId } },
          { student: { userId } },
        ],
        whiteboardSessions: {
          some: { sharedAt: { not: null } },
        },
      },
      select: {
        id: true,
        startTime: true,
        tutor: { select: { userId: true, user: { select: { name: true } } } },
        student: { select: { userId: true, user: { select: { name: true } } } },
        whiteboardSessions: {
          where: { sharedAt: { not: null } },
          select: {
            id: true,
            bookingId: true,
            noteName: true,
            sharedAt: true,
            s3Url: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    return bookings.flatMap((booking) =>
      booking.whiteboardSessions.map((wb) => {
        const isTutor = booking.tutor.userId === userId;
        const counterpartName = isTutor
          ? booking.student?.user?.name || 'Student'
          : booking.tutor?.user?.name || 'Tutor';
        const classDate = booking.startTime
          ? new Date(booking.startTime).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
          : '';
        return {
          id: wb.id,
          bookingId: wb.bookingId,
          noteName: wb.noteName || `ClassWhiteBoardNotes-${counterpartName}_${classDate}`,
          sharedAt: wb.sharedAt,
          s3Url: wb.s3Url,
          counterpartName,
          classDate: booking.startTime,
        };
      }),
    );
  }

  /**
   * Download a shared whiteboard note as JSON through backend.
   * This avoids exposing direct S3 URLs in the browser.
   */
  async downloadSharedNote(noteId: string, userId: string) {
    const wb = await this.prisma.whiteboardSession.findUnique({
      where: { id: noteId },
      include: {
        booking: {
          include: {
            tutor: true,
            student: true,
          },
        },
      },
    });

    if (!wb || !wb.booking) {
      throw new NotFoundException('Whiteboard note not found');
    }

    const isTutor = wb.booking.tutor.userId === userId;
    const isStudent = wb.booking.student.userId === userId;
    if (!isTutor && !isStudent) {
      throw new ForbiddenException('Access denied');
    }

    const payload = this.isPlainObject(wb.data) ? wb.data : { data: wb.data };
    const jsonBuffer = Buffer.from(JSON.stringify(payload, null, 2));
    const baseName = String(wb.noteName || `whiteboard-note-${wb.bookingId}`).trim();
    const safeName = baseName
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 120);

    return {
      fileName: `${safeName || 'whiteboard-notes'}.json`,
      contentType: 'application/json',
      content: jsonBuffer,
    };
  }
}
