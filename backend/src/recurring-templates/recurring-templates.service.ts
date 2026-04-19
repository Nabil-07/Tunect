import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { addDays, addWeeks, isBefore } from 'date-fns';
import { Prisma, BookingStatus } from '@prisma/client';

@Injectable()
export class RecurringTemplatesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateTemplateDto) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor profile not found');
    }

    return this.prisma.recurringTemplate.create({
      data: {
        tutorId: tutor.id,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        title: dto.title,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findTutorTemplates(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
    });

    if (!tutor) {
      return [];
    }

    return this.prisma.recurringTemplate.findMany({
      where: { tutorId: tutor.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findActiveTemplates(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
    });

    if (!tutor) {
      return [];
    }

    return this.prisma.recurringTemplate.findMany({
      where: {
        tutorId: tutor.id,
        isActive: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async update(templateId: string, userId: string, dto: UpdateTemplateDto) {
    const template = await this.prisma.recurringTemplate.findUnique({
      where: { id: templateId },
      include: { tutor: true },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.tutor.userId !== userId) {
      throw new ForbiddenException('You can only update your own templates');
    }

    // Build update data object, only including fields that are provided
    const updateData: any = {};
    if (dto.dayOfWeek !== undefined) updateData.dayOfWeek = dto.dayOfWeek;
    if (dto.startTime !== undefined) updateData.startTime = dto.startTime;
    if (dto.endTime !== undefined) updateData.endTime = dto.endTime;
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    return this.prisma.recurringTemplate.update({
      where: { id: templateId },
      data: updateData,
    });
  }

  async delete(templateId: string, userId: string) {
    const template = await this.prisma.recurringTemplate.findUnique({
      where: { id: templateId },
      include: { tutor: true },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.tutor.userId !== userId) {
      throw new ForbiddenException('You can only delete your own templates');
    }

    return this.prisma.recurringTemplate.delete({
      where: { id: templateId },
    });
  }

  async toggleActive(templateId: string, userId: string) {
    const template = await this.prisma.recurringTemplate.findUnique({
      where: { id: templateId },
      include: { tutor: true },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.tutor.userId !== userId) {
      throw new ForbiddenException('You can only modify your own templates');
    }

    return this.prisma.recurringTemplate.update({
      where: { id: templateId },
      data: {
        isActive: !template.isActive,
      },
    });
  }

  // ==================== RECURRING BOOKING AUTOMATION ====================

  /**
   * Cron job that runs daily at midnight to generate bookings from recurring templates
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateRecurringBookings() {
    console.log('[RecurringTemplatesService] Starting recurring booking generation...');

    const activeTemplates = await this.prisma.recurringTemplate.findMany({
      where: { isActive: true },
      include: { tutor: { include: { user: true } } },
    });

    let totalGenerated = 0;
    const errors = [];

    for (const template of activeTemplates) {
      try {
        const generated = await this.generateBookingsForTemplate(template.id);
        totalGenerated += generated;
      } catch (error) {
        console.error(`[RecurringTemplatesService] Error generating bookings for template ${template.id}:`, error);
        errors.push({ templateId: template.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    console.log(`[RecurringTemplatesService] Generated ${totalGenerated} bookings from ${activeTemplates.length} templates`);

    return { totalGenerated, errors };
  }

  /**
   * Generate bookings for a specific template for the next week
   */
  async generateBookingsForTemplate(templateId: string): Promise<number> {
    const template = await this.prisma.recurringTemplate.findUnique({
      where: { id: templateId },
      include: { tutor: { include: { user: true } } },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (!template.isActive) {
      throw new BadRequestException('Template is not active');
    }

    const now = new Date();
    const nextGeneration = template.nextGenerationDate || now;

    // Only generate if it's time
    if (isBefore(now, nextGeneration)) {
      return 0;
    }

    // Generate bookings for the next 7-14 days
    const generateUntil = addWeeks(now, 2);
    let bookingsCreated = 0;

    // Find all matching days in the generation window
    const daysToGenerate: Date[] = [];
    let currentDate = addDays(now, 1); // Start from tomorrow

    while (isBefore(currentDate, generateUntil)) {
      // Check if this day matches the template's dayOfWeek (0=Sunday, 6=Saturday)
      if (currentDate.getDay() === template.dayOfWeek) {
        daysToGenerate.push(currentDate);
      }
      currentDate = addDays(currentDate, 1);
    }

    // Create bookings for each matching day
    for (const date of daysToGenerate) {
      // Parse template times (format: "HH:mm") — stored as UTC
      const [startHour, startMinute] = template.startTime.split(':').map(Number);
      const [endHour, endMinute] = template.endTime.split(':').map(Number);

      // Combine LOCAL calendar date with UTC clock hours.
      // Using Date.UTC(local y/m/d, utcH, utcM) avoids day-crossing when the
      // server runs in a non-UTC timezone (e.g. IST dev machine).
      const startTime = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), startHour, startMinute, 0, 0));
      const endTime   = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), endHour, endMinute, 0, 0));
      if (endTime.getTime() <= startTime.getTime()) {
        endTime.setUTCDate(endTime.getUTCDate() + 1);
      }

      // Check if booking already exists for this time slot
      const existing = await this.prisma.booking.findFirst({
        where: {
          tutorId: template.tutorId,
          recurringTemplateId: template.id,
          startTime,
          status: { not: BookingStatus.CANCELED },
        },
      });

      if (existing) {
        continue; // Skip if already generated
      }

      // Check for tutor conflicts
      const conflict = await this.prisma.booking.findFirst({
        where: {
          tutorId: template.tutorId,
          status: { not: BookingStatus.CANCELED },
          OR: [
            {
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          ],
        },
      });

      if (conflict) {
        console.warn(`[RecurringTemplatesService] Skipping booking for ${startTime} due to conflict`);
        continue;
      }

      // Create the booking based on template type
      if (template.isGroupSession && template.maxGroupSize) {
        // Group session - create with no initial student
        await this.prisma.booking.create({
          data: {
            tutorId: template.tutorId,
            studentId: template.tutor.userId, // Placeholder
            startTime,
            endTime,
            status: BookingStatus.CONFIRMED,
            notes: template.title || 'Recurring group session',
            isDemo: false,
            isGroupSession: true,
            maxStudents: template.maxGroupSize,
            currentEnrollment: 0,
            pricePerStudent: template.pricePerStudent ? new Prisma.Decimal(template.pricePerStudent) : new Prisma.Decimal(10),
            tokensCharged: new Prisma.Decimal(0),
            recurringTemplateId: template.id,
          },
        });
      } else {
        // Regular 1-on-1 - create as PENDING_SLOT waiting for student
        await this.prisma.booking.create({
          data: {
            tutorId: template.tutorId,
            studentId: template.tutor.userId, // Placeholder
            startTime,
            endTime,
            status: 'PENDING_SLOT' as any, // Available for booking
            notes: template.title || 'Recurring session',
            isDemo: false,
            tokensCharged: new Prisma.Decimal(0),
            recurringTemplateId: template.id,
          },
        });
      }

      bookingsCreated++;
    }

    // Update template's last/next generation dates
    await this.prisma.recurringTemplate.update({
      where: { id: template.id },
      data: {
        lastGeneratedDate: now,
        nextGenerationDate: addDays(now, 1), // Generate again tomorrow
      },
    });

    console.log(`[RecurringTemplatesService] Generated ${bookingsCreated} bookings for template ${template.id}`);

    return bookingsCreated;
  }

  /**
   * Manually trigger generation for a specific template (useful for testing)
   */
  async manuallyGenerateForTemplate(templateId: string, userId: string) {
    const template = await this.prisma.recurringTemplate.findUnique({
      where: { id: templateId },
      include: { tutor: true },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.tutor.userId !== userId) {
      throw new ForbiddenException('You can only generate bookings for your own templates');
    }

    const count = await this.generateBookingsForTemplate(templateId);

    return {
      message: `Generated ${count} bookings`,
      bookingsCreated: count,
    };
  }

  /**
   * Get generated bookings for a template
   */
  async getGeneratedBookings(templateId: string, userId: string) {
    const template = await this.prisma.recurringTemplate.findUnique({
      where: { id: templateId },
      include: { tutor: true },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.tutor.userId !== userId) {
      throw new ForbiddenException('You can only view your own template bookings');
    }

    return this.prisma.booking.findMany({
      where: {
        recurringTemplateId: templateId,
        status: { not: BookingStatus.CANCELED },
      },
      include: {
        student: { include: { user: { select: { name: true, email: true } } } },
      },
      orderBy: { startTime: 'asc' },
    });
  }
}
