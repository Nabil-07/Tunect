"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const p = new client_1.PrismaClient();
async function main() {
    const users = await p.$queryRawUnsafe(`
    SELECT id, email, name, role, "deletedAt", "isBanned"
    FROM "User"
    WHERE id IN ('seed_user_student_001','seed_user_tutor_001','seed_user_tutor_002')
  `);
    console.log('\n=== USER RECORDS (soft-delete check) ===');
    if (users.length === 0) {
        console.log('  !! HARD DELETED - No user records found at all!');
    }
    else {
        users.forEach(u => {
            const status = u.deletedAt ? `SOFT-DELETED on ${u.deletedAt}` : 'ACTIVE';
            console.log(`  ${u.email} | ${u.role} | ${status} | banned=${u.isBanned}`);
        });
    }
    const bookings = await p.booking.count({ where: { studentId: 'seed_student_001' } });
    const tokenLedger = await p.tokenLedger.count({ where: { studentId: 'seed_student_001' } });
    const payments = await p.payment.count({ where: { userId: 'seed_user_student_001' } });
    const reviews = await p.review.count({ where: { studentId: 'seed_student_001' } });
    const conversations = await p.conversation.count({ where: { studentId: 'seed_student_001' } });
    const messages = await p.message.count({ where: { conversationId: { in: ['seed_conv_001', 'seed_conv_002'] } } });
    console.log('\n=== STUDENT TRANSACTIONAL DATA ===');
    console.log(`  Bookings:        ${bookings}`);
    console.log(`  Token Ledger:    ${tokenLedger}`);
    console.log(`  Payments:        ${payments}`);
    console.log(`  Reviews:         ${reviews}`);
    console.log(`  Conversations:   ${conversations}`);
    console.log(`  Messages:        ${messages}`);
    const walletLedger1 = await p.tutorWalletLedger.count({ where: { tutorId: 'seed_tutor_001' } });
    const walletLedger2 = await p.tutorWalletLedger.count({ where: { tutorId: 'seed_tutor_002' } });
    const wallet1 = await p.$queryRawUnsafe(`SELECT balance FROM "TutorWallet" WHERE "tutorId" = 'seed_tutor_001'`);
    const wallet2 = await p.$queryRawUnsafe(`SELECT balance FROM "TutorWallet" WHERE "tutorId" = 'seed_tutor_002'`);
    const payouts = await p.payout.count({ where: { tutorId: 'seed_tutor_001' } });
    const kycDocs = await p.kycDocument.count({ where: { tutorId: { in: ['seed_tutor_001', 'seed_tutor_002'] } } });
    const attendance = await p.bookingAttendance.count({ where: { bookingId: { startsWith: 'seed_booking' } } });
    console.log('\n=== TUTOR TRANSACTIONAL DATA ===');
    console.log(`  Tutor 1 Wallet Balance: ${wallet1[0]?.balance ?? 'NOT FOUND'}`);
    console.log(`  Tutor 1 Wallet Ledger:  ${walletLedger1}`);
    console.log(`  Tutor 2 Wallet Balance: ${wallet2[0]?.balance ?? 'NOT FOUND'}`);
    console.log(`  Tutor 2 Wallet Ledger:  ${walletLedger2}`);
    console.log(`  Payouts:                ${payouts}`);
    console.log(`  KYC Documents:          ${kycDocs}`);
    console.log(`  Attendance Records:     ${attendance}`);
    const assignments = await p.assignment.count({ where: { studentId: 'seed_student_001' } });
    const sessionNotes = await p.sessionNote.count({ where: { bookingId: { startsWith: 'seed_booking' } } });
    const disputes = await p.dispute.count({ where: { bookingId: { startsWith: 'seed_booking' } } });
    const notifications = await p.notification.count({ where: { userId: { in: ['seed_user_student_001', 'seed_user_tutor_001', 'seed_user_tutor_002'] } } });
    console.log('\n=== OTHER DATA ===');
    console.log(`  Assignments:     ${assignments}`);
    console.log(`  Session Notes:   ${sessionNotes}`);
    console.log(`  Disputes:        ${disputes}`);
    console.log(`  Notifications:   ${notifications}`);
    const bookingStatuses = await p.$queryRawUnsafe(`
    SELECT status, "isDemo", COUNT(*)::int as count
    FROM "Booking"
    WHERE "studentId" = 'seed_student_001'
    GROUP BY status, "isDemo"
    ORDER BY status
  `);
    console.log('\n=== BOOKING STATUS BREAKDOWN ===');
    bookingStatuses.forEach(b => {
        console.log(`  ${b.status} (demo=${b.isDemo}): ${b.count}`);
    });
    console.log('\n=== SUMMARY ===');
    const totalTransactional = bookings + tokenLedger + payments + reviews + walletLedger1 + walletLedger2 + payouts + kycDocs + attendance + assignments + sessionNotes + disputes + notifications + messages + conversations;
    console.log(`  Total transactional records: ${totalTransactional}`);
    console.log(`  Users found in DB: ${users.length}/3`);
    const allSoftDeleted = users.length > 0 && users.every(u => u.deletedAt !== null);
    const anyHardDeleted = users.length < 3;
    if (allSoftDeleted && !anyHardDeleted) {
        console.log('  ✓ All 3 users SOFT-DELETED, transactional data PRESERVED');
    }
    else if (anyHardDeleted) {
        console.log(`  ⚠ ${3 - users.length} user(s) HARD-DELETED (missing from DB)`);
    }
    else {
        console.log('  ⚠ Some users still active (not deleted yet)');
    }
    await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
//# sourceMappingURL=verify-delete.js.map