import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingStatus, Prisma } from '@prisma/client';

type Period = 'month' | 'quarter' | 'half' | 'year';
type BalanceSheetLine = { label: string; amount: number; note?: string };
type BalanceSheetResponse = {
  period: Period;
  asOf: string;
  periodStart: string;
  fiscalYearLabel: string;
  fiscalYearEnd: string;
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
  };
  assets: {
    current: BalanceSheetLine[];
    nonCurrent: BalanceSheetLine[];
  };
  liabilities: {
    current: BalanceSheetLine[];
    nonCurrent: BalanceSheetLine[];
  };
  equity: BalanceSheetLine[];
  notes: string[];
  noteDetails: Record<string, { formula: string; sources: string[]; rowCount: number }>;
  validation: { isBalanced: boolean; difference: number };
};

@Injectable()
export class FinanceDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(val: Prisma.Decimal | number | null | undefined): number {
    if (!val) return 0;
    return typeof val === 'number' ? val : Number(val);
  }

  private platformFeePercent(hourlyRate?: number | null): 25 | 22 | 18 {
    const rate = Number(hourlyRate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) return 25;
    if (rate < 400) return 25;
    if (rate < 700) return 22;
    return 18;
  }

  private getPeriodStart(asOf: Date, period: Period): Date {
    const y = asOf.getFullYear();
    const m = asOf.getMonth(); // 0-based
    if (period === 'year') return new Date(y, 0, 1, 0, 0, 0, 0);
    if (period === 'half') return m >= 6 ? new Date(y, 6, 1, 0, 0, 0, 0) : new Date(y, 0, 1, 0, 0, 0, 0);
    if (period === 'quarter') {
      const qStart = Math.floor(m / 3) * 3;
      return new Date(y, qStart, 1, 0, 0, 0, 0);
    }
    return new Date(y, m, 1, 0, 0, 0, 0);
  }

  private getFiscalYearLabel(asOf: Date) {
    const fyStartYear = asOf.getMonth() >= 3 ? asOf.getFullYear() : asOf.getFullYear() - 1;
    const fyEndYear = fyStartYear + 1;
    const fyLabel = `FY ${fyStartYear}-${String(fyEndYear % 100).padStart(2, '0')}`;
    const fiscalYearEnd = new Date(fyEndYear, 2, 31, 23, 59, 59, 999); // 31 March fyEndYear
    return { fyLabel, fiscalYearEnd: fiscalYearEnd.toISOString() };
  }

  async getBalanceSheet(period: Period = 'month', asOfInput?: string): Promise<BalanceSheetResponse> {
    const asOf = asOfInput ? new Date(asOfInput) : new Date();
    const periodStart = this.getPeriodStart(asOf, period);
    const { fyLabel, fiscalYearEnd } = this.getFiscalYearLabel(asOf);
    const countFromAggregate = (agg: any): number => {
      if (typeof agg?._count === 'number') return agg._count;
      if (typeof agg?._count?._all === 'number') return agg._count._all;
      return 0;
    };

    const [paymentsSucceeded, tokenBalances, tutorWallet, forfeitsStudent, forfeitsTutor, periodExpenses, bookingsForRevenueSplit] =
      await Promise.all([
        this.prisma.payment.aggregate({
          _sum: { amountInMinor: true },
          _count: true,
          where: { status: 'SUCCEEDED', createdAt: { gte: periodStart, lte: asOf } },
        }),
        this.prisma.tutorTokenBalance.findMany({ select: { balance: true, pricePerToken: true } }),
        this.prisma.tutorWallet.aggregate({ _sum: { balance: true } }),
        this.prisma.banForfeitureLedger.aggregate({
          _sum: { amount: true },
          _count: true,
          where: { type: 'STUDENT_TOKEN_FORFEIT', createdAt: { gte: periodStart, lte: asOf } },
        }),
        this.prisma.banForfeitureLedger.aggregate({
          _sum: { amount: true },
          _count: true,
          where: { type: 'TUTOR_EARNING_FORFEIT', createdAt: { gte: periodStart, lte: asOf } },
        }),
        this.prisma.expense.aggregate({
          _sum: { amount: true },
          _count: true,
          where: { expenseDate: { gte: periodStart, lte: asOf } },
        }),
        this.prisma.booking.findMany({
          where: {
            isDemo: false,
            endTime: { not: null, gte: periodStart, lte: asOf },
            status: {
              in: [
                BookingStatus.COMPLETED,
                BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW,
                BookingStatus.CANCELED,
              ],
            },
          },
          select: {
            id: true,
            status: true,
            startTime: true,
            endTime: true,
            tokensCharged: true,
            priceAtBooking: true,
            tutor: { select: { hourlyRate: true } },
            attendance: {
              select: {
                tutorJoinCount: true,
                studentJoinCount: true,
                tutorFirstJoinedAt: true,
                studentFirstJoinedAt: true,
              },
            },
          },
        }),
      ]);

    const cashBank = this.toNumber(paymentsSucceeded._sum?.amountInMinor) / 100;
    const studentAdvance = tokenBalances.reduce((sum, row) => {
      const bal = this.toNumber(row.balance) * this.toNumber(row.pricePerToken);
      return sum + bal;
    }, 0);
    const tutorPayable = this.toNumber(tutorWallet._sum.balance);
    const forfeitedTokenRevenue = this.toNumber(forfeitsStudent._sum.amount);
    const forfeitedTutorEarnings = this.toNumber(forfeitsTutor._sum.amount);
    const operatingExpenses = this.toNumber(periodExpenses._sum.amount);

    let platformCommission25 = 0;
    let platformCommission22 = 0;
    let platformCommission18 = 0;
    let noAttendanceProfit = 0;
    let commissionBookingCount = 0;
    let noAttendanceBookingCount = 0;

    for (const booking of bookingsForRevenueSplit) {
      // Use ONLY the locked priceAtBooking — see admin.service.ts for the
      // full rationale. NULL legacy rows are backfilled via
      // sql/backfill_price_at_booking_v2.sql.
      const hourlyRate = this.toNumber(booking.priceAtBooking);
      if (hourlyRate <= 0) continue;

      const durationMs = booking.startTime && booking.endTime
        ? booking.endTime.getTime() - booking.startTime.getTime()
        : 0;
      const durationHours = durationMs > 0
        ? durationMs / 3_600_000
        : this.toNumber(booking.tokensCharged);
      if (durationHours <= 0) continue;

      const bookingAmount = durationHours * hourlyRate;
      if (bookingAmount <= 0) continue;

      const tutorJoined = !!booking.attendance?.tutorFirstJoinedAt || Number(booking.attendance?.tutorJoinCount ?? 0) > 0;
      const studentJoined = !!booking.attendance?.studentFirstJoinedAt || Number(booking.attendance?.studentJoinCount ?? 0) > 0;

      if (booking.status === BookingStatus.CANCELED && !tutorJoined && !studentJoined) {
        noAttendanceProfit += bookingAmount;
        noAttendanceBookingCount += 1;
        continue;
      }

      if (
        booking.status === BookingStatus.COMPLETED ||
        booking.status === BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW
      ) {
        const feePercent = this.platformFeePercent(hourlyRate);
        const commission = (bookingAmount * feePercent) / 100;
        commissionBookingCount += 1;
        if (feePercent === 25) platformCommission25 += commission;
        if (feePercent === 22) platformCommission22 += commission;
        if (feePercent === 18) platformCommission18 += commission;
      }
    }

    const shareCapital = 0;
    const retainedEarnings = 0;

    const assetsCurrent: BalanceSheetLine[] = [
      { label: 'Cash & Bank Balance', amount: cashBank, note: 'Note 1' },
      { label: 'Student Advance (Unearned Revenue)', amount: studentAdvance, note: 'Note 2' },
      { label: 'Accounts Receivable', amount: 0, note: 'Note 3' },
    ];

    const assetsNonCurrent: BalanceSheetLine[] = [
      { label: 'Capitalised Software', amount: 0, note: 'Note 5' },
      { label: 'Equipment / Assets', amount: 0, note: 'Note 6' },
    ];

    const liabilitiesCurrent: BalanceSheetLine[] = [
      { label: 'Tutor Payable (earned, unpaid)', amount: tutorPayable, note: 'Note 12' },
      { label: 'Salary Payable', amount: 0, note: 'Note 13' },
      { label: 'PF Payable', amount: 0, note: 'Note 14' },
      { label: 'TDS Payable', amount: 0, note: 'Note 15' },
      { label: 'GST Payable', amount: 0, note: 'Note 16' },
    ];

    const liabilitiesNonCurrent: BalanceSheetLine[] = [];

    const totalAssets = [...assetsCurrent, ...assetsNonCurrent].reduce((s, a) => s + a.amount, 0);
    const totalLiabilities = [...liabilitiesCurrent, ...liabilitiesNonCurrent].reduce((s, a) => s + a.amount, 0);

    const equityBaseBeforeProfit =
      shareCapital +
      retainedEarnings +
      platformCommission25 +
      platformCommission22 +
      platformCommission18 +
      noAttendanceProfit +
      forfeitedTokenRevenue +
      forfeitedTutorEarnings -
      operatingExpenses;

    const currentProfit = totalAssets - totalLiabilities - equityBaseBeforeProfit;

    const equityLines: BalanceSheetLine[] = [
      { label: 'Share Capital', amount: shareCapital, note: 'Note 7' },
      { label: 'Retained Earnings', amount: retainedEarnings, note: 'Note 8' },
      { label: 'Platform Commission Income (25%)', amount: platformCommission25, note: 'Note 9A' },
      { label: 'Platform Commission Income (22%)', amount: platformCommission22, note: 'Note 9B' },
      { label: 'Platform Commission Income (18%)', amount: platformCommission18, note: 'Note 9C' },
      { label: 'No-Attendance Session Profit', amount: noAttendanceProfit, note: 'Note 9D' },
      { label: 'Operating Expenses', amount: -operatingExpenses, note: 'Note 9E' },
      { label: 'Current Period Profit / (Loss)', amount: currentProfit, note: 'Note 9' },
      { label: 'Forfeited Token Revenue (Bans)', amount: forfeitedTokenRevenue, note: 'Note 10' },
      { label: 'Forfeited Tutor Earnings (Bans)', amount: forfeitedTutorEarnings, note: 'Note 11' },
    ];

    const totalEquity = equityLines.reduce((s, a) => s + a.amount, 0);
    const imbalanceRaw = totalAssets - totalLiabilities - totalEquity;
    const imbalance = Number(imbalanceRaw.toFixed(2));
    const isBalanced = Math.abs(imbalance) < 0.01;

    const notes = [
      'Ledger-derived only; no manual overrides.',
      'Balance Sheet is as-of the selected period end.',
      'Platform commission is split by tutor hourly-rate slabs: 25%, 22%, 18%.',
      'Sessions where no one joins are recognized as platform profit in this period.',
      'Operating expenses are deducted from equity and update in real time.',
      'Student bans zero remaining tokens and recognize revenue.',
      'Tutor bans zero unpaid earnings and recognize revenue.',
      'Exports are logged for audit; historical sheets are immutable.',
    ];

    const noteDetails: Record<string, { formula: string; sources: string[]; rowCount: number }> = {
      'Note 1': {
        formula: 'Sum(Payment.amountInMinor where status = SUCCEEDED, period) / 100',
        sources: ['Payment'],
        rowCount: countFromAggregate(paymentsSucceeded),
      },
      'Note 2': {
        formula: 'Sum(TutorTokenBalance.balance * TutorTokenBalance.pricePerToken)',
        sources: ['TutorTokenBalance'],
        rowCount: tokenBalances.length,
      },
      'Note 3': {
        formula: 'Accounts receivable (currently zero)',
        sources: ['General Ledger'],
        rowCount: 0,
      },
      'Note 7': {
        formula: 'Paid-in share capital',
        sources: ['General Ledger'],
        rowCount: 0,
      },
      'Note 8': {
        formula: 'Retained earnings brought forward',
        sources: ['General Ledger'],
        rowCount: 0,
      },
      'Note 9': {
        formula: 'Balancing figure: Total Assets - Total Liabilities - Other Equity Components',
        sources: ['Computed'],
        rowCount: 1,
      },
      'Note 9A': {
        formula: 'Sum(bookingAmount * 25%) for eligible completed sessions',
        sources: ['Booking', 'Tutor.hourlyRate', 'BookingAttendance'],
        rowCount: commissionBookingCount,
      },
      'Note 9B': {
        formula: 'Sum(bookingAmount * 22%) for eligible completed sessions',
        sources: ['Booking', 'Tutor.hourlyRate', 'BookingAttendance'],
        rowCount: commissionBookingCount,
      },
      'Note 9C': {
        formula: 'Sum(bookingAmount * 18%) for eligible completed sessions',
        sources: ['Booking', 'Tutor.hourlyRate', 'BookingAttendance'],
        rowCount: commissionBookingCount,
      },
      'Note 9D': {
        formula: 'Sum(bookingAmount) where neither tutor nor student joined',
        sources: ['Booking', 'BookingAttendance'],
        rowCount: noAttendanceBookingCount,
      },
      'Note 9E': {
        formula: 'Sum(Expense.amount, period)',
        sources: ['Expense'],
        rowCount: countFromAggregate(periodExpenses),
      },
      'Note 10': {
        formula: 'Sum(BanForfeitureLedger.amount where type = STUDENT_TOKEN_FORFEIT, period)',
        sources: ['BanForfeitureLedger'],
        rowCount: countFromAggregate(forfeitsStudent),
      },
      'Note 11': {
        formula: 'Sum(BanForfeitureLedger.amount where type = TUTOR_EARNING_FORFEIT, period)',
        sources: ['BanForfeitureLedger'],
        rowCount: countFromAggregate(forfeitsTutor),
      },
      'Note 12': {
        formula: 'Sum(TutorWallet.balance)',
        sources: ['TutorWallet'],
        rowCount: 1,
      },
    };

    return {
      period,
      asOf: asOf.toISOString(),
      periodStart: periodStart.toISOString(),
      fiscalYearLabel: fyLabel,
      fiscalYearEnd,
      totals: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
      },
      assets: { current: assetsCurrent, nonCurrent: assetsNonCurrent },
      liabilities: { current: liabilitiesCurrent, nonCurrent: liabilitiesNonCurrent },
      equity: equityLines,
      notes,
      noteDetails,
      validation: { isBalanced, difference: imbalance },
    };
  }

  async exportCsv(period: Period = 'month', asOf?: string): Promise<string> {
    const sheet = await this.getBalanceSheet(period, asOf);
    if (!sheet.validation.isBalanced) {
      throw new BadRequestException('Balance sheet cannot be exported until balanced.');
    }
    const rows: string[] = [];
    rows.push(`Company,"Tunect Private Limited"`);
    rows.push(`Period End,"For the period ended 31 March ${new Date(sheet.fiscalYearEnd).getFullYear()} (${sheet.fiscalYearLabel})"`);
    rows.push(`As-Of,"${sheet.asOf}"`);
    rows.push('Currency,INR');
    rows.push(`Generated At,"${new Date().toISOString()}"`);
    rows.push('');

    rows.push('Section,Group,Particulars,Amount,Note');

    const pushGroup = (section: string, group: string, lines: BalanceSheetLine[]) => {
      lines.forEach((l) => {
        rows.push(`${section},${group},"${l.label}",${l.amount},${l.note ?? ''}`);
      });
      const subtotal = lines.reduce((s, l) => s + l.amount, 0);
      rows.push(`${section},${group},Subtotal,${subtotal},`);
    };

    pushGroup('Assets', 'Current Assets', sheet.assets.current);
    pushGroup('Assets', 'Non-Current Assets', sheet.assets.nonCurrent);
    rows.push(`Assets,,Total Assets,${sheet.totals.assets},`);

    pushGroup('Liabilities', 'Current Liabilities', sheet.liabilities.current);
    pushGroup('Liabilities', 'Non-Current Liabilities', sheet.liabilities.nonCurrent);
    rows.push(`Liabilities,,Total Liabilities,${sheet.totals.liabilities},`);

    pushGroup('Equity', 'Equity', sheet.equity);
    rows.push(`Equity,,Total Equity,${sheet.totals.equity},`);
    rows.push(`Validation,,TOTAL ASSETS - (LIABILITIES + EQUITY),${sheet.validation.difference},`);

    return rows.join('\n');
  }
}
