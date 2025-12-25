import { Controller, Get, Post, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';

@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FavoritesController {
  constructor(private readonly service: FavoritesService) {}

  @ApiOperation({ summary: 'Get my favorite tutors' })
  @Get('my')
  @Roles(Role.STUDENT)
  async getMyFavorites(@CurrentUser('sub') userId: string) {
    return this.service.getFavorites(userId);
  }

  @ApiOperation({ summary: 'Add tutor to favorites' })
  @ApiParam({ name: 'tutorId', description: 'Tutor ID to favorite' })
  @Post(':tutorId')
  @Roles(Role.STUDENT)
  async addFavorite(
    @CurrentUser('sub') userId: string,
    @Param('tutorId') tutorId: string,
  ) {
    return this.service.addFavorite(userId, tutorId);
  }

  @ApiOperation({ summary: 'Remove tutor from favorites' })
  @ApiParam({ name: 'tutorId', description: 'Tutor ID to unfavorite' })
  @Delete(':tutorId')
  @Roles(Role.STUDENT)
  async removeFavorite(
    @CurrentUser('sub') userId: string,
    @Param('tutorId') tutorId: string,
  ) {
    return this.service.removeFavorite(userId, tutorId);
  }

  @ApiOperation({ summary: 'Check if tutor is favorited' })
  @ApiParam({ name: 'tutorId', description: 'Tutor ID to check' })
  @Get('check/:tutorId')
  @Roles(Role.STUDENT)
  async checkFavorite(
    @CurrentUser('sub') userId: string,
    @Param('tutorId') tutorId: string,
  ) {
    const isFavorite = await this.service.isFavorite(userId, tutorId);
    return { isFavorite };
  }
}
