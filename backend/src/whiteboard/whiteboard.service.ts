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
}
