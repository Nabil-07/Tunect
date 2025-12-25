import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { PaymentsService } from './payments.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RefundDto } from './dto/refund.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator'; // ✅ correct path
import { Role } from '../auth/role.enum';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiOperation({ summary: 'Create Razorpay order' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('order')
  createOrder(@CurrentUser('sub') userId: string, @Body() dto: CreateOrderDto) {
    return this.payments.createOrder(userId, dto);
  }

  @ApiOperation({ summary: 'Verify Razorpay payment & finalize (credit tokens)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('verify')
  verify(@CurrentUser('sub') userId: string, @Body() dto: VerifyPaymentDto) {
    return this.payments.verifyAndFinalize(userId, dto);
  }

  @ApiOperation({ summary: 'Razorpay webhook (raw body, no auth)' })
  @Post('razorpay/webhook')
  @HttpCode(200)
  webhook(
    @Headers() headers: Record<string, any>,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const raw = (req.rawBody ?? Buffer.from('')) as Buffer;
    return this.payments.handleWebhook(headers, raw);
  }

  @ApiOperation({ summary: 'Refund a captured payment (full or partial) — ADMIN only' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('refund')
  refund(@Body() dto: RefundDto) {
    return this.payments.refund(dto);
  }

  @ApiOperation({ summary: 'Get a payment by id (owner or admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getPayment(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.payments.getByIdForUser(id, userId, role);
  }

  @ApiOperation({ summary: 'Get payment receipt/details' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/receipt')
  async getReceipt(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
    @Res() res: Response,
  ) {
    const receiptData = await this.payments.getReceiptForUser(id, userId, role);
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt-${id}.pdf`);
    
    // Generate and stream PDF
    await this.payments.generateReceiptPDF(receiptData, res);
  }
}
