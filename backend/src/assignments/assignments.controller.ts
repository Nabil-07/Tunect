import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto, UpdateAssignmentDto, SubmitAssignmentDto, GradeAssignmentDto } from './dto/assignment.dto';

const MAX_ASSIGNMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ASSIGNMENT_ALLOWED_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const assignmentUploadOptions = {
  limits: {
    fileSize: MAX_ASSIGNMENT_FILE_SIZE_BYTES,
  },
  fileFilter: (_req: any, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
    if (ASSIGNMENT_ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Unsupported assignment file type') as any, false);
    }
  },
};

@ApiTags('assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create assignment (Tutor)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', assignmentUploadOptions))
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAssignmentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.assignmentsService.create(userId, dto, file);
  }

  @Get('tutor')
  @ApiOperation({ summary: 'Get all assignments as tutor' })
  findTutorAssignments(@CurrentUser('id') userId: string) {
    return this.assignmentsService.findTutorAssignments(userId);
  }

  @Get('student')
  @ApiOperation({ summary: 'Get all assignments as student' })
  findStudentAssignments(@CurrentUser('id') userId: string) {
    return this.assignmentsService.findStudentAssignments(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get assignment by ID' })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.assignmentsService.findOne(id, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update assignment (Tutor)' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignmentsService.update(id, userId, dto);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit assignment (Student)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', assignmentUploadOptions))
  submit(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitAssignmentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.assignmentsService.submit(id, userId, dto, file);
  }

  @Post('submissions/:id/grade')
  @ApiOperation({ summary: 'Grade submission (Tutor)' })
  grade(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: GradeAssignmentDto,
  ) {
    return this.assignmentsService.grade(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete assignment (Tutor)' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.assignmentsService.delete(id, userId);
  }
}
