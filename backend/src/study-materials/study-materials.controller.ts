import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { StudyMaterialsService } from './study-materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
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
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateMaterialDto) {
    return this.service.create(userId, dto);
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  findMyMaterials(@CurrentUser('sub') userId: string) {
    return this.service.findTutorMaterials(userId);
  }

  @Get('public')
  findPublicMaterials(@Query('subject') subject?: string) {
    return this.service.findPublicMaterials(subject);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  update(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateMaterialDto,
  ) {
    return this.service.update(id, userId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  delete(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.delete(id, userId);
  }

  @Post(':id/download')
  incrementDownload(@Param('id') id: string) {
    return this.service.incrementDownload(id);
  }
}
