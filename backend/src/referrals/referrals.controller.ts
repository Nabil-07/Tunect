import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReferralsService } from './referrals.service';
import { CreateReferralDto } from './dto/referral.dto';

@ApiTags('referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create referral invitation' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReferralDto) {
    return this.referralsService.create(userId, dto);
  }

  @Get('my-code')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my referral code and stats' })
  getMyReferralCode(@CurrentUser('id') userId: string) {
    return this.referralsService.getMyReferralCode(userId);
  }

  @Get('my-referrals')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all my referrals' })
  findMyReferrals(@CurrentUser('id') userId: string) {
    return this.referralsService.findMyReferrals(userId);
  }

  @Get('validate')
  @ApiOperation({ summary: 'Validate referral code' })
  validateCode(@Query('code') code: string) {
    return this.referralsService.validateReferralCode(code);
  }
}
