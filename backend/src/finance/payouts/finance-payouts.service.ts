import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** CONFIG */
const IST_TZ = 'Asia/Kolkata';
const PAYOUT_DAYS = [1, 8, 14, 21] as const;
type PayoutDay = typeof PAYOUT_DAYS[number];

type BatchLine = {
  tutorId: string;
  openingBalance: number;
  sessionsGross: number;      // sum of unitPrice for included sessions
  commission: number;         // platform fee
  gstOnCommission: number;    // GST on platform fee
  tutorGross: number;         // sessionsGross - commission
  tds: number;                // TDS on tutorGross
  otherFees: number;          // instant withdraw etc.
  netPayable: number;         // tutorGross - tds - otherFees
  closingBalance: number;
  providerRef?: string | null;
  status: 'READY' | 'SENT' | 'PAID' | 'FAILED';
};

@Injectable()
export class FinancePayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  /** -------- Utilities (timezone-safe) -------- */

  private nowIST(): Date {
    // Convert "now" to IST by re-parsing a locale string in that TZ.
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: IST_TZ }));
  }
  
  private async assertTutorNotBanned(tutorId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { user: { select: { id: true, isBanned: true, bannedScope: true } } },
    });
    
    if (!tutor) throw new BadRequestException('Tutor not found');
    
    const scope = tutor.user?.bannedScope;
    if (tutor.user?.isBanned && (scope === 'ALL' || scope === 'PAYOUTS')) {
      throw new ForbiddenException('Tutor is banned from payouts');
    }
  }

  private ymFrom(month?: string): { y: number; m: number } {
    // month = 'YYYY-MM' (1-based month)
    const d = this.nowIST();
    if (!month) return { y: d.getFullYear(), m: d.getMonth() + 1 };
    const mMatch = /^(\d{4})-(\d{2})$/.exec(month);
    if (!mMatch) throw new BadRequestException('month must be YYYY-MM');
    return { y: Number(mMatch[1]), m: Number(mMatch[2]) };
  }

  private makeBatchKey(y: number, m: number, day: PayoutDay): string {
    const mm = String(m).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }

  private parseBatchKey(batchKey: string): { y: number; m: number; d: number } {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(batchKey);
    if (!m) throw new BadRequestException('batchKey must be YYYY-MM-DD');
    const y = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
    if (!PAYOUT_DAYS.includes(dd as PayoutDay)) {
      throw new BadRequestException('batchKey day must be one of 1,8,14,21');
    }
    return { y, m: mm, d: dd };
  }

  private getPayoutDaysForMonth(y: number, m: number): string[] {
    // Only include payout days that actually exist in the calendar month (all do).
    return PAYOUT_DAYS.map(d => this.makeBatchKey(y, m, d));
  }

  /** -------- Public API -------- */

  async listBatches(month?: string) {
    const { y, m } = this.ymFrom(month);
    const keys = this.getPayoutDaysForMonth(y, m);

    // TODO: For each key, compute totals from DB.
    const batches = await Promise.all(
      keys.map(async (batchKey) => {
        // Placeholder totals; replace with Prisma aggregates.
        return {
          batchKey,
          tutorsCount: 0,
          totalNetPayable: 0,
          status: 'DRAFT' as 'DRAFT' | 'CONFIRMED' | 'EXECUTED' | 'PARTIAL' | 'FAILED',
          // Optional: createdAt/confirmedAt/executedAt
        };
      })
    );

    return { month: `${y}-${String(m).padStart(2, '0')}`, batches };
  }

  async getBatch(batchKey: string) {
    this.parseBatchKey(batchKey);
    // TODO: Fetch per-tutor lines from DB for this batchKey.
    const lines: BatchLine[] = [];
    return { batchKey, lines };
  }

  async previewBatch(batchKey: string, tutorId?: string) {
    this.parseBatchKey(batchKey);
    if (tutorId) {
      await this.assertTutorNotBanned(tutorId);
    }
    // TODO: Sum PENDING TokenLedger rows where batchKey matches (and optional tutorId)
    // then compute commission, GST, TDS, net per tutor.

    // Example placeholder:
    const totals = {
      tutorsCount: 0,
      sessionsGross: 0,
      commission: 0,
      gstOnCommission: 0,
      tutorGross: 0,
      tds: 0,
      otherFees: 0,
      netPayable: 0,
    };

    return { batchKey, tutorId: tutorId ?? null, totals };
  }

  async confirmBatch(batchKey: string, dryRun: boolean) {
    this.parseBatchKey(batchKey);
    if (dryRun) {
      // Do not mutate DB, just return a preview-like response.
      const preview = await this.previewBatch(batchKey);
      return { batchKey, confirmed: false, dryRun: true, preview: preview.totals };
    }

    // Idempotent commit:
    // 1) Find PENDING ledger rows for batchKey
    // 2) Lock them (set e.g. status=LOCKED/FOR_PAYOUT, attach batchId)
    // 3) Create/Upsert Payout rows per tutor
    // 4) Mark batch as CONFIRMED
    // TODO: implement with transactions

    return { batchKey, confirmed: true, dryRun: false };
  }

  async executeBatch(batchKey: string) {
    this.parseBatchKey(batchKey);

    // Idempotent trigger:
    // 1) Read CONFIRMED lines
    // 2) Create payout transfers via provider (RazorpayX/Stripe)
    // 3) Store providerRef; set status=SENT
    // 4) Let webhook update to PAID/FAILED
    // TODO: enqueue job & return job id

    return { batchKey, execution: 'queued' };
  }

  async handleWebhook(provider: string, payload: any) {
    // TODO:
    // - Verify provider signature
    // - Map event → payout row(s)
    // - Update payout + token-ledger status to PAID/FAILED
    // - Write audit log
    return { provider, ok: true };
  }

  /** -------- Scheduler orchestration (1/8/14/21 IST) -------- */

  async runScheduledIfDue() {
    const ist = this.nowIST();
    const day = ist.getDate();
    if (!PAYOUT_DAYS.includes(day as PayoutDay)) return { due: false };

    const y = ist.getFullYear();
    const m = ist.getMonth() + 1;
    const batchKey = this.makeBatchKey(y, m, day as PayoutDay);

    // Idempotent flow: preview → confirm → execute
    await this.previewBatch(batchKey);
    await this.confirmBatch(batchKey, false);
    await this.executeBatch(batchKey);

    return { due: true, batchKey };
  }
}
