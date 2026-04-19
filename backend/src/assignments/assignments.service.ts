import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/services/s3.service';
import { OpenAIService } from '../common/services/openai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAssignmentDto, UpdateAssignmentDto, SubmitAssignmentDto, GradeAssignmentDto } from './dto/assignment.dto';

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    private openaiService: OpenAIService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Create a new assignment with AI safety scan
   */
  async create(userId: string, dto: CreateAssignmentDto, file?: Express.Multer.File) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor profile not found');
    }

    // Token eligibility gate: tutor can only assign to students with active tokens or future bookings
    const tokenBalance = await this.prisma.tutorTokenBalance.findUnique({
      where: {
        studentId_tutorId: {
          studentId: dto.studentId,
          tutorId: tutor.id,
        },
      },
      select: { balance: true },
    });

    const hasTokens = tokenBalance && Number(tokenBalance.balance) > 0;

    // Also check for future confirmed bookings
    let hasFutureBookings = false;
    if (!hasTokens) {
      const futureBooking = await this.prisma.booking.findFirst({
        where: {
          tutorId: tutor.id,
          studentId: dto.studentId,
          startTime: { gt: new Date() },
          status: { in: ['CONFIRMED', 'PENDING'] },
        },
        select: { id: true },
      });
      hasFutureBookings = !!futureBooking;
    }

    if (!hasTokens && !hasFutureBookings) {
      throw new BadRequestException('Student does not have active tokens or upcoming sessions with you');
    }

    let fileUrl: string | null = null;
    let extractedText = dto.description || '';

    // Upload file to S3 if provided
    if (file) {
      fileUrl = await this.s3Service.uploadFile(
        file.buffer,
        file.originalname,
        'assignments',
      );

      // Extract text from file (for scanning)
      extractedText += `\n${await this.extractTextFromFile(file)}`;
    }

    // Run AI safety scan
    const scanResult = await this.openaiService.scanForContactInfo(extractedText);

    const assignment = await this.prisma.assignment.create({
      data: {
        tutorId: tutor.id,
        studentId: dto.studentId,
        bookingId: dto.bookingId,
        title: dto.title,
        description: dto.description,
        fileUrl: fileUrl || undefined,
        fileType: file?.mimetype,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        aiScanStatus: scanResult.isClean ? 'CLEAN' : 'FLAGGED',
        aiScanReason: scanResult.isClean 
          ? null 
          : `Detected: ${scanResult.flaggedReasons.join(', ')}`,
        isVisibleToStudent: scanResult.isClean, // Only visible if clean
      },
      include: {
        tutor: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        student: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
      },
    });

    if (!scanResult.isClean) {
      this.logger.warn(
        `Assignment ${assignment.id} flagged: ${scanResult.flaggedReasons.join(', ')}`,
      );
    }

    // Send email notification to student (only if assignment is visible)
    if (scanResult.isClean && assignment.student?.user?.email) {
      this.notificationsService.sendAssignmentEmail({
        studentEmail: assignment.student.user.email,
        studentName: assignment.student.user.name ?? undefined,
        tutorName: assignment.tutor?.user?.name ?? undefined,
        assignmentTitle: assignment.title,
      }).catch((err) => this.logger.warn(`Failed to send assignment email: ${err?.message}`));
    }

    return assignment;
  }

  /**
   * Get all assignments for a tutor
   */
  async findTutorAssignments(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
    });

    if (!tutor) {
      return [];
    }

    return this.prisma.assignment.findMany({
      where: { tutorId: tutor.id },
      include: {
        student: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        assignmentSubmissions: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all assignments for a student (only visible ones)
   */
  async findStudentAssignments(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return [];
    }

    return this.prisma.assignment.findMany({
      where: {
        studentId: student.id,
        isVisibleToStudent: true, // Only show clean assignments
      },
      include: {
        tutor: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        assignmentSubmissions: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get single assignment
   */
  async findOne(id: string, userId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        tutor: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        student: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        assignmentSubmissions: {
          orderBy: { submittedAt: 'desc' },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Check access
    const isStudent = assignment.student.userId === userId;
    const isTutor = assignment.tutor.userId === userId;

    if (!isStudent && !isTutor) {
      throw new ForbiddenException('Access denied');
    }

    // Students can only see visible assignments
    if (isStudent && !assignment.isVisibleToStudent) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  /**
   * Update assignment
   */
  async update(id: string, userId: string, dto: UpdateAssignmentDto) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: { tutor: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.tutor.userId !== userId) {
      throw new ForbiddenException('Only the tutor can update this assignment');
    }

    return this.prisma.assignment.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status as any,
        isVisibleToStudent: dto.isVisibleToStudent,
      },
    });
  }

  /**
   * Submit assignment (student)
   */
  async submit(assignmentId: string, userId: string, dto: SubmitAssignmentDto, file?: Express.Multer.File) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { student: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.student.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    if (!file) {
      throw new BadRequestException('Submission file is required');
    }

    const fileUrl = await this.s3Service.uploadFile(
      file.buffer,
      file.originalname,
      'submissions',
    );

    const submission = await this.prisma.assignmentSubmission.create({
      data: {
        assignmentId,
        fileUrl,
        notes: dto.notes,
      },
    });

    // Update assignment status
    await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: { status: 'SUBMITTED' },
    });

    return submission;
  }

  /**
   * Grade assignment (tutor)
   */
  async grade(submissionId: string, userId: string, dto: GradeAssignmentDto) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: { tutor: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.assignment.tutor.userId !== userId) {
      throw new ForbiddenException('Only the tutor can grade this submission');
    }

    const [updatedSubmission] = await this.prisma.$transaction([
      this.prisma.assignmentSubmission.update({
        where: { id: submissionId },
        data: {
          grade: dto.grade,
          feedback: dto.feedback,
        },
      }),
      this.prisma.assignment.update({
        where: { id: submission.assignmentId },
        data: { status: 'GRADED' },
      }),
    ]);

    return updatedSubmission;
  }

  /**
   * Delete assignment
   */
  async delete(id: string, userId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: { tutor: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.tutor.userId !== userId) {
      throw new ForbiddenException('Only the tutor can delete this assignment');
    }

    // Delete file from S3
    if (assignment.fileUrl) {
      try {
        await this.s3Service.deleteFile(assignment.fileUrl);
      } catch (error) {
        this.logger.warn(`Failed to delete S3 file: ${assignment.fileUrl}`);
      }
    }

    return this.prisma.assignment.delete({
      where: { id },
    });
  }

  /**
   * Extract text from file (simplified for now)
   * In production, use libraries like pdf-parse, tesseract.js, etc.
   */
  private async extractTextFromFile(file: Express.Multer.File): Promise<string> {
    // For text files, convert buffer to string
    if (file.mimetype === 'text/plain') {
      return file.buffer.toString('utf-8');
    }

    // For PDFs and images, you would use specialized libraries
    // For now, return empty string (AI can't scan binary content without extraction)
    this.logger.warn(`Text extraction not implemented for ${file.mimetype}`);
    return '';
  }
}
