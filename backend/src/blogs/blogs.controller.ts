import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogs: BlogsService) {}

  // Public endpoints
  @Get()
  listPublic(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.blogs.listPublic(Number(page) || 1, Number(pageSize) || 10);
  }

  // Admin endpoints
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/list')
  listAdmin(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.blogs.listAdmin(Number(page) || 1, Number(pageSize) || 20);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/pillars')
  listPillars() {
    return this.blogs.listPillars();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateBlogDto) {
    return this.blogs.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBlogDto) {
    return this.blogs.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.blogs.remove(id);
  }

  @Get(':slug')
  getPublic(@Param('slug') slug: string) {
    return this.blogs.getPublicBySlug(slug);
  }
}
