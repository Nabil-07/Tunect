import { Injectable } from '@nestjs/common';

@Injectable()
export class FinanceDashboardService {
  async getMonthRollup(month?: string) {
    // TODO: query payments, token ledger, payouts to compute:
    // Total Student Payment, Gross Sessions Revenue, Platform Commission, GST on Commission,
    // Tutor Payouts, Tutor Carryover, Net Platform Earnings, Estimated Net GST Payable, Bank Closing
    return {
      month: month ?? 'current',
      totals: {
        totalStudentPayment: 0,
        grossSessions: 0,
        platformCommission: 0,
        gstOnCommission: 0,
        tutorPayouts: 0,
        tutorCarryover: 0,
        netPlatformEarnings: 0,
        estimatedNetGstPayable: 0,
        bankClosing: 0,
      },
    };
  }
}
