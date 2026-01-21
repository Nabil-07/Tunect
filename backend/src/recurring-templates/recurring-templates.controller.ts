import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { RecurringTemplatesService } from './recurring-templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('recurring-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TUTOR)
export class RecurringTemplatesController {
  constructor(private readonly service: RecurringTemplatesService) {}

  @Post()
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateTemplateDto) {
    return this.service.create(userId, dto);
  }

  @Get('my')
  findMyTemplates(@CurrentUser('sub') userId: string) {
    return this.service.findTutorTemplates(userId);
  }

  @Get('active')
  findActiveTemplates(@CurrentUser('sub') userId: string) {
    return this.service.findActiveTemplates(userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.service.update(id, userId, dto);
  }

  @Patch(':id')
  updatePatch(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.service.update(id, userId, dto);
  }

  @Patch(':id/toggle')
  toggleActive(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.toggleActive(id, userId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.delete(id, userId);
  }

  @Post(':id/generate')
  manuallyGenerate(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.manuallyGenerateForTemplate(id, userId);
  }

  @Get(':id/bookings')
  getGeneratedBookings(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.getGeneratedBookings(id, userId);
  }
}
