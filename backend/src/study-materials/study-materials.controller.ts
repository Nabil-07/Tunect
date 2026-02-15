import { BadRequestException, Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudyMaterialsService } from './study-materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { FinalizeMaterialDto } from './dto/finalize-material.dto';
import { ShareMaterialDto } from './dto/share-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('study-materials')
@UseGuards(JwtAuthGuard)
export class StudyMaterialsController {
  constructor(private readonly service: StudyMaterialsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new BadRequestException('Only PDF files are supported'), false);
      }
    },
  }))
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateMaterialDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.create(userId, dto, file);
  }

  @Post('finalize')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  finalize(@CurrentUser('sub') userId: string, @Body() dto: FinalizeMaterialDto) {
    return this.service.finalize(userId, dto);
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  findMyMaterials(@CurrentUser('sub') userId: string) {
    return this.service.findTutorMaterials(userId);
  }

  @Get('shareable-students')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  getShareableStudents(@CurrentUser('sub') userId: string) {
    return this.service.getShareableStudents(userId);
  }

  @Get('shared-with-me')
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  getSharedWithMe(@CurrentUser('sub') userId: string) {
    return this.service.findSharedWithStudent(userId);
  }

  @Get('public')
  findPublicMaterials(@Query('subject') subject?: string) {
    return this.service.findPublicMaterials(subject);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/share-targets')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  getShareTargets(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.getShareTargets(id, userId);
  }

  @Put(':id')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new BadRequestException('Only PDF files are supported'), false);
      }
    },
  }))
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  update(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateMaterialDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.update(id, userId, dto, file);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  delete(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.delete(id, userId);
  }

  @Post(':id/share')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  shareWithStudents(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: ShareMaterialDto,
  ) {
    return this.service.shareWithStudents(id, userId, dto.studentIds);
  }

  @Post(':id/download')
  incrementDownload(@Param('id') id: string) {
    return this.service.incrementDownload(id);
  }
}
