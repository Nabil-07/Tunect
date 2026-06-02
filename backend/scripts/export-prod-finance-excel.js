/**
 * Export production financial data to a multi-sheet Excel workbook.
 *
 * Preferred (reads DATABASE_URL from backend/.env.prod):
 *   npm run export:finance
 *
 * Or pass DATABASE_URL explicitly:
 *   npm run export:finance:env
 *
 * Optional: OUTPUT_PATH=/path/to/file.xlsx
 */
const { PrismaClient, BookingStatus } = require('@prisma/client');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL is not set. Run: npm run export:finance\n' +
      '(uses backend/.env.prod) or set DATABASE_URL manually.',
  );
  process.exit(1);
}

const dbHost = (() => {
  try {
    return new URL(DATABASE_URL.replace(/^postgresql:/, 'http:')).hostname;
  } catch {
    return '(unknown)';
  }
})();
console.log(`Using database host: ${dbHost}`);

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
});

const dec = (v) => {
  if (v == null || v === '') return null;
  const n = Number(typeof v === 'object' && v.toString ? v.toString() : v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const dt = (v) => (v ? new Date(v).toISOString() : '');

const inrFromPaise = (minor) => dec(Number(minor || 0) / 100);

function sheetFromRows(rows, name) {
  if (!rows.length) {
    return { name, data: [['(no rows)']] };
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  return { name, ws };
}

function tryLoadEarningsHelpers() {
  try {
    return require('../dist/common/tutor-lifetime-earnings');
  } catch {
    return null;
  }
}

async function main() {
  const earningsMod = tryLoadEarningsHelpers();
  const payableWhere = earningsMod?.payableBookingWhere;
  const sumShares = earningsMod?.sumTutorShareFromBookings;
  const shareForBooking = earningsMod?.tutorShareForBooking;

  console.log('Connecting to database…');

  const [
    payments,
    refunds,
    tokenLedger,
    payouts,
    walletLedger,
    expenses,
    refundRequests,
    gatewayTxns,
    couponUsages,
    bookings,
    tutors,
    students,
    wallets,
  ] = await Promise.all([
    prisma.payment.findMany({
      include: { user: { select: { id: true, email: true, name: true, role: true, deletedAt: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.refund.findMany({
      include: {
        Payment: {
          include: { user: { select: { email: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tokenLedger.findMany({
      include: {
        student: { include: { user: { select: { email: true, name: true, deletedAt: true } } } },
        tutor: { include: { user: { select: { email: true, name: true } } } },
        booking: { select: { id: true, status: true, startTime: true } },
        payment: { select: { id: true, status: true, amountInMinor: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payout.findMany({
      include: {
        tutor: { include: { user: { select: { email: true, name: true, deletedAt: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tutorWalletLedger.findMany({
      include: {
        tutor: { include: { user: { select: { email: true, name: true } } } },
        booking: { select: { id: true, status: true, startTime: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.expense.findMany({ orderBy: { expenseDate: 'desc' } }),
    prisma.refundRequest.findMany({
      include: {
        student: { include: { user: { select: { email: true, name: true } } } },
        tutor: { include: { user: { select: { email: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.gatewayTxn.findMany({
      include: { Payment: { include: { user: { select: { email: true, name: true } } } } },
      orderBy: { txnDate: 'desc' },
      take: 50000,
    }),
    prisma.couponUsage.findMany({
      include: {
        user: { select: { email: true, name: true } },
        coupon: { select: { code: true } },
      },
      orderBy: { usedAt: 'desc' },
    }),
    prisma.booking.findMany({
      where: { isDemo: false, tokensCharged: { gt: 0 } },
      include: {
        student: { include: { user: { select: { email: true, name: true } } } },
        tutor: { include: { user: { select: { email: true, name: true } } } },
        lotConsumptions: {
          where: { reversed: false },
          select: { qty: true, pricePerToken: true },
        },
      },
      orderBy: { startTime: 'desc' },
    }),
    prisma.tutor.findMany({
      include: {
        user: { select: { id: true, email: true, name: true, role: true, isBanned: true, deletedAt: true, createdAt: true } },
        wallet: true,
      },
    }),
    prisma.student.findMany({
      include: {
        user: { select: { id: true, email: true, name: true, role: true, deletedAt: true, createdAt: true } },
      },
    }),
    prisma.tutorWallet.findMany({
      include: { tutor: { include: { user: { select: { email: true, name: true } } } } },
    }),
  ]);

  const activeStudentIds = new Set();
  const activeTutorIds = new Set();

  const userIdToStudentId = new Map(students.map((s) => [s.userId, s.id]));

  for (const p of payments) {
    const sid = userIdToStudentId.get(p.userId);
    if (sid) activeStudentIds.add(sid);
  }
  for (const t of tokenLedger) {
    activeStudentIds.add(t.studentId);
    if (t.tutorId) activeTutorIds.add(t.tutorId);
  }
  for (const b of bookings) {
    activeStudentIds.add(b.studentId);
    activeTutorIds.add(b.tutorId);
  }
  for (const p of payouts) activeTutorIds.add(p.tutorId);
  for (const w of walletLedger) activeTutorIds.add(w.tutorId);

  const studentPaymentsRows = payments.map((p) => ({
    paymentId: p.id,
    studentEmail: p.user?.email ?? '',
    studentName: p.user?.name ?? '',
    status: p.status,
    provider: p.provider,
    amountINR: inrFromPaise(p.amountInMinor),
    amountPaise: Number(p.amountInMinor),
    tokensPurchased: p.tokensPurchased,
    currency: p.currency,
    providerOrderId: p.providerOrderId ?? '',
    providerPaymentId: p.providerPaymentId ?? '',
    createdAt: dt(p.createdAt),
    updatedAt: dt(p.updatedAt),
  }));

  const succeededPayments = payments.filter((p) => p.status === 'SUCCEEDED');
  const totalReceivedINR = succeededPayments.reduce(
    (s, p) => s + Number(p.amountInMinor || 0) / 100,
    0,
  );
  const totalRefundedINR = refunds.reduce((s, r) => s + Number(r.amountInMinor || 0) / 100, 0);
  const totalPaidToTutorsINR = payouts
    .filter((p) => p.status === 'PAID')
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalExpensesINR = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalPenaltiesINR = walletLedger
    .filter((e) => e.reason === 'DEMERIT_PENALTY')
    .reduce((s, e) => s + Math.abs(Number(e.delta)), 0);

  const tutorSummaryRows = [];
  for (const tutor of tutors) {
    if (!activeTutorIds.has(tutor.id)) continue;

    let lifetimeEarnings = null;
    let payableSessions = null;
    if (payableWhere && sumShares && shareForBooking) {
      const payableBookings = bookings.filter(
        (b) =>
          b.tutorId === tutor.id &&
          (b.status === BookingStatus.COMPLETED ||
            b.status === BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW),
      );
      const { totalEarnings, sessionsPaid } = sumShares(payableBookings);
      lifetimeEarnings = totalEarnings;
      payableSessions = sessionsPaid;
    }

    const tutorPayouts = payouts.filter((p) => p.tutorId === tutor.id);
    const paidOut = tutorPayouts
      .filter((p) => p.status === 'PAID')
      .reduce((s, p) => s + Number(p.amount), 0);
    const pendingPayout = tutorPayouts
      .filter((p) => p.status === 'PENDING')
      .reduce((s, p) => s + Number(p.amount), 0);
    const penalties = walletLedger
      .filter((e) => e.tutorId === tutor.id && e.reason === 'DEMERIT_PENALTY')
      .reduce((s, e) => s + Math.abs(Number(e.delta)), 0);
    const walletBal = dec(tutor.wallet?.balance);
    const unpaidComputed =
      lifetimeEarnings != null
        ? Math.max(0, dec(lifetimeEarnings - paidOut - penalties))
        : null;

    tutorSummaryRows.push({
      tutorId: tutor.id,
      tutorEmail: tutor.user?.email ?? '',
      tutorName: tutor.user?.name ?? '',
      status: tutor.status,
      hourlyRate: tutor.hourlyRate,
      isBanned: tutor.user?.isBanned ?? false,
      payableSessions,
      lifetimeEarningsINR: lifetimeEarnings,
      totalPaidOutINR: dec(paidOut),
      pendingPayoutINR: dec(pendingPayout),
      penaltiesDeductedINR: dec(penalties),
      unpaidComputedINR: unpaidComputed,
      walletBalanceINR: walletBal,
      payoutCount: tutorPayouts.length,
      paidPayoutCount: tutorPayouts.filter((p) => p.status === 'PAID').length,
    });
  }
  tutorSummaryRows.sort((a, b) => (b.lifetimeEarningsINR ?? 0) - (a.lifetimeEarningsINR ?? 0));

  const activeStudentsRows = students
    .filter((s) => activeStudentIds.has(s.id))
    .map((s) => {
      const studentPayments = payments.filter((p) => p.userId === s.userId);
      const paidINR = studentPayments
        .filter((p) => p.status === 'SUCCEEDED')
        .reduce((sum, p) => sum + Number(p.amountInMinor) / 100, 0);
      const bookingCount = bookings.filter((b) => b.studentId === s.id).length;
      return {
        studentId: s.id,
        userId: s.userId,
        email: s.user?.email ?? '',
        name: s.user?.name ?? '',
        profileStatus: s.profileStatus,
        tokensBalance: dec(s.tokens),
        totalPaidINR: dec(paidINR),
        paymentCount: studentPayments.length,
        bookingCount,
        createdAt: dt(s.createdAt),
        deleted: s.user?.deletedAt ? 'yes' : 'no',
      };
    });

  const activeTutorsRows = tutors
    .filter((t) => activeTutorIds.has(t.id))
    .map((t) => {
      const summary = tutorSummaryRows.find((r) => r.tutorId === t.id);
      return {
        tutorId: t.id,
        userId: t.userId,
        email: t.user?.email ?? '',
        name: t.user?.name ?? '',
        status: t.status,
        hourlyRate: t.hourlyRate,
        isBanned: t.user?.isBanned ?? false,
        lifetimeEarningsINR: summary?.lifetimeEarningsINR ?? '',
        totalPaidOutINR: summary?.totalPaidOutINR ?? '',
        walletBalanceINR: summary?.walletBalanceINR ?? '',
        payableSessions: summary?.payableSessions ?? '',
        createdAt: dt(t.createdAt),
        deleted: t.user?.deletedAt ? 'yes' : 'no',
      };
    });

  const bookingRows = bookings.map((b) => {
    let tutorShareINR = null;
    if (shareForBooking) {
      tutorShareINR = shareForBooking({
        id: b.id,
        startTime: b.startTime,
        endTime: b.endTime,
        tokensCharged: b.tokensCharged,
        priceAtBooking: b.priceAtBooking,
        lotConsumptions: b.lotConsumptions,
      });
    }
    const grossApprox =
      b.lotConsumptions?.length > 0
        ? b.lotConsumptions.reduce(
            (s, c) => s + Number(c.qty) * Number(c.pricePerToken),
            0,
          )
        : dec(Number(b.priceAtBooking || 0) * Number(b.tokensCharged || 0));

    return {
      bookingId: b.id,
      status: b.status,
      isDemo: b.isDemo,
      tutorEmail: b.tutor?.user?.email ?? '',
      tutorName: b.tutor?.user?.name ?? '',
      studentEmail: b.student?.user?.email ?? '',
      studentName: b.student?.user?.name ?? '',
      startTime: dt(b.startTime),
      endTime: dt(b.endTime),
      tokensCharged: dec(b.tokensCharged),
      priceAtBooking: dec(b.priceAtBooking),
      grossApproxINR: dec(grossApprox),
      tutorShareINR: dec(tutorShareINR),
      refundProcessed: b.refundProcessed ?? false,
      createdAt: dt(b.createdAt),
    };
  });

  const summaryRows = [
    { metric: 'Export generated at (UTC)', value: new Date().toISOString() },
    { metric: 'Active students (with financial activity)', value: activeStudentsRows.length },
    { metric: 'Active tutors (with financial activity)', value: activeTutorsRows.length },
    { metric: 'Total student payments (SUCCEEDED) INR', value: dec(totalReceivedINR) },
    { metric: 'Total payment refunds INR', value: dec(totalRefundedINR) },
    { metric: 'Net received from students (approx) INR', value: dec(totalReceivedINR - totalRefundedINR) },
    { metric: 'Total paid to tutors (PAID payouts) INR', value: dec(totalPaidToTutorsINR) },
    { metric: 'Total expenses INR', value: dec(totalExpensesINR) },
    { metric: 'Total demerit penalties INR', value: dec(totalPenaltiesINR) },
    {
      metric: 'Platform margin (approx) INR',
      value: dec(totalReceivedINR - totalRefundedINR - totalPaidToTutorsINR - totalExpensesINR),
    },
    { metric: 'Payment records (all statuses)', value: payments.length },
    { metric: 'Payout records', value: payouts.length },
    { metric: 'Bookings (non-demo, tokens>0)', value: bookings.length },
    { metric: 'Token ledger entries', value: tokenLedger.length },
    { metric: 'Tutor wallet ledger entries', value: walletLedger.length },
  ];

  const workbook = XLSX.utils.book_new();

  const addSheet = (name, rows) => {
    const safeName = name.slice(0, 31);
    const ws = rows.length
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([['(no data)']]);
    XLSX.utils.book_append_sheet(workbook, ws, safeName);
  };

  addSheet('Summary', summaryRows);
  addSheet('Active_Students', activeStudentsRows);
  addSheet('Active_Tutors', activeTutorsRows);
  addSheet('Tutor_Earnings_Summary', tutorSummaryRows);
  addSheet('Student_Payments', studentPaymentsRows);
  addSheet('Payment_Refunds', refunds.map((r) => ({
    refundId: r.id,
    paymentId: r.paymentId,
    studentEmail: r.Payment?.user?.email ?? '',
    amountINR: inrFromPaise(r.amountInMinor),
    amountPaise: r.amountInMinor,
    reason: r.reason ?? '',
    providerRefundId: r.providerRefundId ?? '',
    createdAt: dt(r.createdAt),
  })));
  addSheet('Token_Ledger', tokenLedger.map((e) => ({
    id: e.id,
    studentEmail: e.student?.user?.email ?? '',
    tutorEmail: e.tutor?.user?.email ?? '',
    delta: dec(e.delta),
    reason: e.reason,
    bookingId: e.bookingId ?? '',
    bookingStatus: e.booking?.status ?? '',
    paymentId: e.paymentId ?? '',
    description: e.description ?? '',
    createdAt: dt(e.createdAt),
    expiresAt: dt(e.expiresAt),
  })));
  addSheet('Bookings_Financial', bookingRows);
  addSheet('Tutor_Payouts', payouts.map((p) => ({
    payoutId: p.id,
    tutorEmail: p.tutor?.user?.email ?? '',
    tutorName: p.tutor?.user?.name ?? '',
    amountINR: dec(p.amount),
    status: p.status,
    paymentMethod: p.paymentMethod ?? '',
    transactionId: p.transactionId ?? '',
    reference: p.reference ?? '',
    createdAt: dt(p.createdAt),
    paidAt: dt(p.paidAt),
  })));
  addSheet('Tutor_Wallet_Ledger', walletLedger.map((e) => ({
    id: e.id,
    tutorEmail: e.tutor?.user?.email ?? '',
    deltaINR: dec(e.delta),
    reason: e.reason,
    bookingId: e.bookingId ?? '',
    note: e.note ?? '',
    createdAt: dt(e.createdAt),
  })));
  addSheet('Tutor_Wallets', wallets.map((w) => ({
    tutorEmail: w.tutor?.user?.email ?? '',
    balanceINR: dec(w.balance),
    updatedAt: dt(w.updatedAt),
  })));
  addSheet('Expenses', expenses.map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category,
    amountINR: dec(e.amount),
    description: e.description ?? '',
    expenseDate: dt(e.expenseDate),
    createdBy: e.createdBy ?? '',
    createdAt: dt(e.createdAt),
  })));
  addSheet('Refund_Requests', refundRequests.map((r) => ({
    id: r.id,
    studentEmail: r.student?.user?.email ?? '',
    tutorEmail: r.tutor?.user?.email ?? '',
    tokenAmount: dec(r.tokenAmount),
    status: r.status,
    reason: r.reason ?? '',
    purchaseDate: dt(r.purchaseDate),
    createdAt: dt(r.createdAt),
    processedAt: dt(r.processedAt),
  })));
  addSheet('Gateway_Txns', gatewayTxns.map((g) => ({
    id: g.id,
    provider: g.provider,
    event: g.event ?? '',
    txnDate: dt(g.txnDate),
    ref: g.ref ?? '',
    amountINR: dec(g.amount),
    feeINR: dec(g.fee),
    paymentId: g.paymentId ?? '',
    studentEmail: g.Payment?.user?.email ?? '',
  })));
  addSheet('Coupon_Usage', couponUsages.map((c) => ({
    id: c.id,
    couponCode: c.coupon?.code ?? '',
    userEmail: c.user?.email ?? '',
    usedAt: dt(c.usedAt),
  })));

  const outDir = path.join(__dirname, '../../exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath =
    process.env.OUTPUT_PATH ||
    path.join(outDir, `tunect-prod-finance-${stamp}.xlsx`);

  XLSX.writeFile(workbook, outPath);
  console.log(`Wrote ${outPath}`);
  console.log('Sheets:', workbook.SheetNames.join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
