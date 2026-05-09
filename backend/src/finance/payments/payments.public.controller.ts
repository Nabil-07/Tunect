import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PaymentsPublicService } from './payments-public.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STUDENT')
@Controller('payments')
export class PaymentsPublicController {
  constructor(private readonly paymentsService: PaymentsPublicService) {}

  @ApiOperation({ summary: 'Create Razorpay order for token purchase' })
  @Post('order')
  async createOrder(
    @Req() req: any,
    @Body() dto: { tutorId: string; tokens?: number; packId?: string; couponCode?: string; displayCurrency?: string },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.paymentsService.createOrder(userId, dto);
  }

  @ApiOperation({ summary: 'Verify Razorpay payment' })
  @Post('verify')
  async verifyPayment(
    @Req() req: any,
    @Body() dto: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.paymentsService.verifyPayment(userId, dto);
  }

  @ApiOperation({ summary: 'Report Razorpay payment failure (called by frontend on checkout error)' })
  @Post('failed')
  async reportFailed(
    @Req() req: any,
    @Body() dto: { razorpay_order_id: string; error_reason?: string },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.paymentsService.reportPaymentFailed(userId, dto);
  }
}
