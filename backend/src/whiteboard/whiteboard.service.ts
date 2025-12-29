import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/services/s3.service';

@Injectable()
export class WhiteboardService {
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
  ) {}

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

    // Upsert whiteboard data
    return this.prisma.whiteboardSession.upsert({
      where: { bookingId },
      update: {
        data,
        updatedAt: new Date(),
      },
      create: {
        bookingId,
        data,
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
}
