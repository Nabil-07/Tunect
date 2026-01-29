import { Controller, Post, Get, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RefundsService } from './refunds.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('refunds')
@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @ApiOperation({ summary: 'Request token transfer (student)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Post('transfer')
  async createTransferRequest(
    @Req() req: any,
    @Body() body: {
      fromTutorId: string;
      toTutorId: string;
      tokenAmount: number;
      reason?: string;
    },
  ) {
    const studentId = req.user.studentId;
    if (!studentId) {
      throw new Error('Student account not found');
    }

    return this.refundsService.createTokenTransferRequest(
      studentId,
      body.fromTutorId,
      body.toTutorId,
      body.tokenAmount,
      body.reason,
    );
  }

  @ApiOperation({ summary: 'Request refund (student)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Post('request')
  async createRefundRequest(
    @Req() req: any,
    @Body() body: {
      tutorId: string;
      tokenAmount: number;
      purchaseDate: string;
      reason?: string;
    },
  ) {
    const studentId = req.user.studentId;
    if (!studentId) {
      throw new Error('Student account not found');
    }

    return this.refundsService.createRefundRequest(
      studentId,
      body.tutorId,
      body.tokenAmount,
      new Date(body.purchaseDate),
      body.reason,
    );
  }

  @ApiOperation({ summary: 'Approve/reject token transfer (admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('transfer/:id/process')
  async processTransferRequest(
    @Req() req: any,
    @Param('id') requestId: string,
    @Body() body: { approved: boolean; adminNotes?: string },
  ) {
    const adminId = req.user.id;
    return this.refundsService.processTokenTransferRequest(
      requestId,
      adminId,
      body.approved,
      body.adminNotes,
      req,
    );
  }

  @ApiOperation({ summary: 'Approve/reject refund request (admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('request/:id/process')
  async processRefundRequest(
    @Req() req: any,
    @Param('id') requestId: string,
    @Body() body: { approved: boolean; adminNotes?: string },
  ) {
    const adminId = req.user.id;
    return this.refundsService.processRefundRequest(
      requestId,
      adminId,
      body.approved,
      body.adminNotes,
      req,
    );
  }

  @ApiOperation({ summary: 'Get pending transfer requests (admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('transfer/pending')
  async getPendingTransfers() {
    return this.refundsService.getPendingTransferRequests();
  }

  @ApiOperation({ summary: 'Get pending refund requests (admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('request/pending')
  async getPendingRefunds() {
    return this.refundsService.getPendingRefundRequests();
  }

  @ApiOperation({ summary: 'Get my refund requests (student)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Get('request/my')
  async getMyRefundRequests(@Req() req: any) {
    const studentId = req.user.studentId;
    if (!studentId) {
      throw new Error('Student account not found');
    }
    return this.refundsService.getMyRefundRequests(studentId);
  }

  @ApiOperation({ summary: 'Get my transfer requests (student)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Get('transfer/my')
  async getMyTransferRequests(@Req() req: any) {
    const studentId = req.user.studentId;
    if (!studentId) {
      throw new Error('Student account not found');
    }
    return this.refundsService.getMyTransferRequests(studentId);
  }
}
