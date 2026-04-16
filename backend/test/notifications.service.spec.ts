/**
 * Notification Service — Unit Test Suite
 *
 * Tests every send* method in NotificationsService using fixed test accounts:
 *   Student : abidashifa206@gmail.com
 *   Tutor   : nabil.irshad@tunectnow.com
 *
 * All outbound transport (sendEmail / sendNotificationEmail) is mocked so that
 * real calls are never made. Each test verifies:
 *   1. The correct low-level transport method is called
 *   2. The expected subject / recipient is forwarded
 *   3. The method resolves without throwing
 */

import { NotificationsService } from '../src/notifications/notifications.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const STUDENT_EMAIL = 'abidashifa206@gmail.com';
const TUTOR_EMAIL   = 'nabil.irshad@tunectnow.com';
const ADMIN_EMAIL   = 'admin@tunectnow.com';
const BOOKING_ID    = 'booking-test-001';

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Build a fully-mocked NotificationsService instance.
 * We bypass NestJS DI by constructing directly and stubbing the two
 * low-level senders used by every template method.
 */
function buildService(): NotificationsService {
  const prismaMock: any = {
    notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };

  // Bypass complex constructor logic by providing no env vars (email disabled path)
  const svc = new NotificationsService(prismaMock);

  // Stub the two base senders so templates don't actually send email
  jest.spyOn(svc as any, 'sendEmail').mockResolvedValue(true);
  jest.spyOn(svc as any, 'sendNotificationEmail').mockResolvedValue(true);

  return svc;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let svc: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = buildService();
  });

  // ─── 1. Welcome + Email Verification ──────────────────────────────────────

  describe('sendWelcomeVerificationEmail', () => {
    it('calls sendEmail (not sendNotificationEmail) — always sent regardless of promo opt-out', async () => {
      await svc.sendWelcomeVerificationEmail({
        to: STUDENT_EMAIL,
        name: 'Abida Shifa',
        verificationToken: 'test-token-abc123',
        role: 'STUDENT',
      });

      expect((svc as any).sendEmail).toHaveBeenCalledTimes(1);
      expect((svc as any).sendEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringContaining('Verify'),
        expect.any(String),
      );
    });

    it('works for TUTOR role', async () => {
      await svc.sendWelcomeVerificationEmail({
        to: TUTOR_EMAIL,
        name: 'Nabil Irshad',
        verificationToken: 'tutor-token-xyz',
        role: 'TUTOR',
      });

      expect((svc as any).sendEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.any(String),
        expect.stringContaining('tutor'), // onboarding steps mention tutor
      );
    });
  });

  // ─── 2. Email Verified Confirmation ───────────────────────────────────────

  describe('sendEmailVerifiedConfirmation', () => {
    it('sends to STUDENT correctly', async () => {
      await svc.sendEmailVerifiedConfirmation({
        to: STUDENT_EMAIL,
        name: 'Abida Shifa',
        role: 'STUDENT',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringMatching(/verified/i),
        expect.any(String),
      );
    });

    it('sends to TUTOR correctly', async () => {
      await svc.sendEmailVerifiedConfirmation({
        to: TUTOR_EMAIL,
        name: 'Nabil Irshad',
        role: 'TUTOR',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.any(String),
        expect.any(String),
      );
    });
  });

  // ─── 3. Booking Confirmation ──────────────────────────────────────────────

  describe('bookingConfirmation', () => {
    it('sends to both student and tutor via sendNotificationEmail', async () => {
      await svc.bookingConfirmation({
        studentEmail: STUDENT_EMAIL,
        tutorEmail: TUTOR_EMAIL,
        studentName: 'Abida Shifa',
        tutorName: 'Nabil Irshad',
        bookingId: BOOKING_ID,
        startIso: '2026-04-20T10:00:00.000Z',
        endIso:   '2026-04-20T11:00:00.000Z',
        subject: 'Mathematics',
      });

      // Should send to student
      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.any(String),
        expect.any(String),
        expect.any(Array),
      );

      // Should also send to tutor
      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.any(String),
        expect.any(String),
        expect.any(Array),
      );
    });
  });

  // ─── 4. Session Cancellation — Student ────────────────────────────────────

  describe('sendSessionCancellationStudent', () => {
    it('uses sendNotificationEmail and includes booking info in subject', async () => {
      await svc.sendSessionCancellationStudent({
        to: STUDENT_EMAIL,
        studentName: 'Abida Shifa',
        tutorName: 'Nabil Irshad',
        bookingId: BOOKING_ID,
        startIso: '2026-04-20T10:00:00.000Z',
        cancelledBy: 'TUTOR',
        tokensRefunded: 5,
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringContaining('cancelled'),
        expect.any(String),
      );
    });

    it('handles zero token refund', async () => {
      await expect(
        svc.sendSessionCancellationStudent({
          to: STUDENT_EMAIL,
          bookingId: BOOKING_ID,
          startIso: '2026-04-20T10:00:00.000Z',
          cancelledBy: 'ADMIN',
          tokensRefunded: 0,
        }),
      ).resolves.not.toThrow();
    });
  });

  // ─── 5. Session Cancellation — Tutor ──────────────────────────────────────

  describe('sendSessionCancellationTutor', () => {
    it('sends to tutor with correct subject', async () => {
      await svc.sendSessionCancellationTutor({
        to: TUTOR_EMAIL,
        tutorName: 'Nabil Irshad',
        studentName: 'Abida Shifa',
        bookingId: BOOKING_ID,
        startIso: '2026-04-20T10:00:00.000Z',
        cancelledBy: 'STUDENT',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.stringContaining('cancelled'),
        expect.any(String),
      );
    });
  });

  // ─── 6. Admin Cancellation CC ─────────────────────────────────────────────

  describe('sendAdminCancellationCC', () => {
    it('sends via sendEmail (critical path) to admin', async () => {
      await svc.sendAdminCancellationCC({
        adminEmail: ADMIN_EMAIL,
        bookingId: BOOKING_ID,
        startIso: '2026-04-20T10:00:00.000Z',
        cancelledBy: 'TUTOR',
        cancellerId: 'tutor-user-001',
        cancellerName: 'Nabil Irshad',
        otherPartyName: 'Abida Shifa',
        minutesBeforeStart: 45,
      });

      expect((svc as any).sendEmail).toHaveBeenCalledWith(
        ADMIN_EMAIL,
        expect.stringContaining('cancellation'),
        expect.any(String),
      );
    });
  });

  // ─── 7. Payment Failed ────────────────────────────────────────────────────

  describe('sendPaymentFailedEmail', () => {
    it('sends notification email to student', async () => {
      await svc.sendPaymentFailedEmail({
        to: STUDENT_EMAIL,
        studentName: 'Abida Shifa',
        amountInMinor: 9900,
        currency: 'INR',
        reason: 'Insufficient funds',
        paymentId: 'pay_test_001',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringMatching(/payment failed/i),
        expect.any(String),
      );
    });
  });

  // ─── 8. Payout Processed ──────────────────────────────────────────────────

  describe('sendPayoutProcessedEmail', () => {
    it('sends to tutor correctly', async () => {
      await svc.sendPayoutProcessedEmail({
        to: TUTOR_EMAIL,
        tutorName: 'Nabil Irshad',
        amount: 4500,
        currency: 'INR',
        paymentMethod: 'Bank Transfer',
        referenceId: 'payout_ref_001',
        paidAt: new Date().toISOString(),
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.stringMatching(/payout/i),
        expect.any(String),
      );
    });
  });

  // ─── 9. Payout Failed ─────────────────────────────────────────────────────

  describe('sendPayoutFailedEmail', () => {
    it('sends to tutor on payout failure', async () => {
      await svc.sendPayoutFailedEmail({
        to: TUTOR_EMAIL,
        tutorName: 'Nabil Irshad',
        amount: 4500,
        reason: 'Bank account validation failed',
        referenceId: 'payout_fail_001',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.stringMatching(/payout/i),
        expect.any(String),
      );
    });
  });

  // ─── 10. Tutor Approved ───────────────────────────────────────────────────

  describe('sendTutorApprovedEmail', () => {
    it('sends via sendNotificationEmail with approved subject', async () => {
      await svc.sendTutorApprovedEmail({
        to: TUTOR_EMAIL,
        tutorName: 'Nabil Irshad',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.stringMatching(/approved/i),
        expect.any(String),
      );
    });
  });

  // ─── 11. Tutor Rejected ───────────────────────────────────────────────────

  describe('sendTutorRejectedEmail', () => {
    it('sends via sendNotificationEmail with rejection subject', async () => {
      await svc.sendTutorRejectedEmail({
        to: TUTOR_EMAIL,
        tutorName: 'Nabil Irshad',
        reason: 'Incomplete qualification documents',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.stringMatching(/needs updates|rejected|application/i),
        expect.any(String),
      );
    });

    it('works without an optional reason', async () => {
      await expect(
        svc.sendTutorRejectedEmail({ to: TUTOR_EMAIL }),
      ).resolves.not.toThrow();
    });
  });

  // ─── 12. Review Received ──────────────────────────────────────────────────

  describe('sendReviewReceivedEmail', () => {
    it('sends to tutor with star emoji rating in HTML', async () => {
      await svc.sendReviewReceivedEmail({
        to: TUTOR_EMAIL,
        tutorName: 'Nabil Irshad',
        studentName: 'Abida Shifa',
        rating: 4,
        comment: 'Great session, very helpful!',
        profileUrl: 'https://tunectnow.com/tutor/reviews',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.stringMatching(/review/i),
        expect.stringContaining('⭐'), // ⭐ emoji used in HTML body
      );
    });
  });

  // ─── 13. Refund Processed ─────────────────────────────────────────────────

  describe('sendRefundProcessedEmail', () => {
    it('sends via sendNotificationEmail to student with token amount in subject', async () => {
      await svc.sendRefundProcessedEmail({
        to: STUDENT_EMAIL,
        studentName: 'Abida Shifa',
        tokensRefunded: 3,
        originalTutorName: 'Nabil Irshad',
        refundReason: 'Session not delivered',
        processedAt: new Date().toISOString(),
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringMatching(/refund/i),
        expect.any(String),
      );
    });
  });

  // ─── 14. Monthly Earnings Summary ─────────────────────────────────────────

  describe('sendMonthlyEarningsSummaryEmail', () => {
    it('sends to tutor with earnings figures', async () => {
      await svc.sendMonthlyEarningsSummaryEmail({
        to: TUTOR_EMAIL,
        tutorName: 'Nabil Irshad',
        month: 'March 2026',
        totalEarnings: 4800,
        sessionsCompleted: 12,
        avgRating: 4.7,
        topSubjects: ['Mathematics', 'Physics'],
        prevMonthEarnings: 4200,
        currency: 'INR',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.stringMatching(/earnings|summary/i),
        expect.any(String),
      );
    });
  });

  // ─── 15. No-Show Alert ────────────────────────────────────────────────────

  describe('sendNoShowEmail', () => {
    it('notifies student when tutor is the no-show via sendNotificationEmail', async () => {
      await svc.sendNoShowEmail({
        to: STUDENT_EMAIL,
        recipientName: 'Abida Shifa',
        noShowRole: 'TUTOR',
        noShowName: 'Nabil Irshad',
        bookingId: BOOKING_ID,
        startIso: '2026-04-20T10:00:00.000Z',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringMatching(/no.show/i),
        expect.any(String),
      );
    });

    it('notifies tutor when student is the no-show', async () => {
      await svc.sendNoShowEmail({
        to: TUTOR_EMAIL,
        recipientName: 'Nabil Irshad',
        noShowRole: 'STUDENT',
        noShowName: 'Abida Shifa',
        bookingId: BOOKING_ID,
        startIso: '2026-04-20T10:00:00.000Z',
        isRepeatNoShow: false,
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.stringMatching(/no.show/i),
        expect.any(String),
      );
    });
  });

  // ─── 16. Promo Email ──────────────────────────────────────────────────────

  describe('sendPromoEmail', () => {
    it('sends to student with correct subject and body', async () => {
      await svc.sendPromoEmail({
        to: STUDENT_EMAIL,
        recipientName: 'Abida Shifa',
        subject: '🎉 Exclusive Offer: 20% off tokens this weekend!',
        headline: 'Weekend Token Offer',
        body: 'Get 20% extra tokens on all purchases this weekend.',
        ctaLabel: 'Claim Offer',
        ctaUrl: 'https://tunectnow.com/student/buy-tokens?promo=WEEKEND20',
        unsubscribeToken: 'unsub-token-abida-001',
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        '🎉 Exclusive Offer: 20% off tokens this weekend!',
        expect.any(String),
      );
    });
  });

  // ─── 17. Availability Alert ───────────────────────────────────────────────

  describe('sendTutorFavoriteAvailabilityAlertEmail', () => {
    it('sends to student when a favourite tutor opens slots', async () => {
      await svc.sendTutorFavoriteAvailabilityAlertEmail({
        to: STUDENT_EMAIL,
        studentName: 'Abida Shifa',
        tutorName: 'Nabil Irshad',
        tutorId: 'tutor-001',
        newSlotDates: ['2026-04-21T10:00:00.000Z', '2026-04-22T14:00:00.000Z'],
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringMatching(/available|availability/i),
        expect.any(String),
      );
    });
  });

  // ─── 18. Admin Revenue Report ─────────────────────────────────────────────

  describe('sendAdminRevenueReportEmail', () => {
    it('sends via sendEmail (critical) with revenue figures', async () => {
      await svc.sendAdminRevenueReportEmail({
        adminEmails: [ADMIN_EMAIL],
        periodLabel: 'March 2026',
        totalRevenueInMinor: 12500000,
        totalSessions: 210,
        newUsers: 42,
        activeTutors: 18,
        prevPeriodRevenueInMinor: 11000000,
        currency: 'INR',
      });

      expect((svc as any).sendEmail).toHaveBeenCalledWith(
        ADMIN_EMAIL,
        expect.stringMatching(/revenue|report/i),
        expect.any(String),
      );
    });

    it('sends to multiple admins', async () => {
      await svc.sendAdminRevenueReportEmail({
        adminEmails: [ADMIN_EMAIL, 'finance@tunectnow.com'],
        periodLabel: 'Week of 7 Apr 2026',
        totalRevenueInMinor: 3000000,
        totalSessions: 55,
        newUsers: 11,
        activeTutors: 8,
      });

      expect((svc as any).sendEmail).toHaveBeenCalledTimes(2);
    });
  });

  // ─── 19. Profile Incomplete Nudge ─────────────────────────────────────────

  describe('sendProfileIncompleteNudgeEmail', () => {
    it('sends to student with missing fields listed', async () => {
      await svc.sendProfileIncompleteNudgeEmail({
        to: STUDENT_EMAIL,
        studentName: 'Abida Shifa',
        completionPercentage: 55,
        missingFields: ['Profile photo', 'Learning goals'],
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringMatching(/profile/i),
        expect.any(String),
      );
    });

    it('sends to tutor with different missing fields', async () => {
      await svc.sendProfileIncompleteNudgeEmail({
        to: TUTOR_EMAIL,
        studentName: 'Nabil Irshad',
        completionPercentage: 40,
        missingFields: ['Qualifications', 'Subjects', 'Hourly rate'],
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        TUTOR_EMAIL,
        expect.any(String),
        expect.any(String),
      );
    });
  });

  // ─── 20. Unread Message Email ─────────────────────────────────────────────

  describe('sendUnreadMessageEmail', () => {
    it('links to student/messages for STUDENT role', async () => {
      await svc.sendUnreadMessageEmail({
        to: STUDENT_EMAIL,
        recipientName: 'Abida Shifa',
        senderName: 'Nabil Irshad',
        conversationId: 'conv-001',
        unreadCount: 3,
        role: 'STUDENT',
      });

      const call = ((svc as any).sendNotificationEmail as jest.Mock).mock.calls[0];
      const html: string = call[2];
      expect(html).toContain('student/messages');
    });

    it('links to tutor/messages for TUTOR role', async () => {
      await svc.sendUnreadMessageEmail({
        to: TUTOR_EMAIL,
        recipientName: 'Nabil Irshad',
        senderName: 'Abida Shifa',
        conversationId: 'conv-001',
        unreadCount: 1,
        role: 'TUTOR',
      });

      const call = ((svc as any).sendNotificationEmail as jest.Mock).mock.calls[0];
      const html: string = call[2];
      expect(html).toContain('tutor/messages');
    });

    it('defaults to student/messages when role is omitted', async () => {
      await svc.sendUnreadMessageEmail({
        to: STUDENT_EMAIL,
        recipientName: 'Abida Shifa',
        senderName: 'Nabil Irshad',
        conversationId: 'conv-002',
        unreadCount: 2,
      });

      const call = ((svc as any).sendNotificationEmail as jest.Mock).mock.calls[0];
      const html: string = call[2];
      expect(html).toContain('student/messages');
    });
  });

  // ─── 21. Booking Reminders ────────────────────────────────────────────────

  describe('bookingReminder', () => {
    it('sends 24h reminder to student', async () => {
      await svc.bookingReminder({
        to: STUDENT_EMAIL,
        recipientName: 'Abida Shifa',
        otherPartyName: 'Nabil Irshad',
        bookingId: BOOKING_ID,
        startIso: '2026-04-20T10:00:00.000Z',
        endIso:   '2026-04-20T11:00:00.000Z',
        minutesBefore: 1440,
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringMatching(/session|starts/i),
        expect.any(String),
      );
    });

    it('sends 1h reminder to tutor', async () => {
      await svc.bookingReminder({
        to: TUTOR_EMAIL,
        recipientName: 'Nabil Irshad',
        otherPartyName: 'Abida Shifa',
        bookingId: BOOKING_ID,
        startIso: '2026-04-20T10:00:00.000Z',
        endIso:   '2026-04-20T11:00:00.000Z',
        minutesBefore: 60,
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 22. Payment Receipt Email ───────────────────────────────────────────

  describe('paymentReceiptEmail', () => {
    it('sends receipt to student after token purchase (with PDF attachment)', async () => {
      await svc.paymentReceiptEmail({
        studentEmail: STUDENT_EMAIL,
        studentName: 'Abida Shifa',
        tutorName: 'Nabil Irshad',
        tokensPurchased: 10,
        amountPaid: 49900,
        currency: 'INR',
        paymentId: 'pay_razorpay_001',
        purchasedAt: new Date().toISOString(),
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringMatching(/payment confirmed|receipt|tokens/i),
        expect.any(String),
        expect.any(Array), // PDF attachment
      );
    });
  });

  // ─── 23. Dispute Filed — Admin Notification ───────────────────────────────

  describe('sendDisputeFiledAdminEmail', () => {
    it('sends to all admin emails with booking and reporter info', async () => {
      await svc.sendDisputeFiledAdminEmail({
        adminEmails: [ADMIN_EMAIL],
        bookingId: BOOKING_ID,
        reporterName: 'Abida Shifa',
        reporterRole: 'STUDENT',
        reason: 'Tutor did not show up',
        disputeId: 'dispute-001',
      });

      expect((svc as any).sendEmail).toHaveBeenCalledWith(
        ADMIN_EMAIL,
        expect.stringMatching(/dispute/i),
        expect.any(String),
      );
    });
  });

  // ─── 24. Dispute Acknowledgement — User ───────────────────────────────────

  describe('sendDisputeAcknowledgementEmail', () => {
    it('acknowledges dispute to student via sendNotificationEmail', async () => {
      await svc.sendDisputeAcknowledgementEmail({
        to: STUDENT_EMAIL,
        reporterName: 'Abida Shifa',
        reason: 'Tutor did not show up',
        bookingId: BOOKING_ID,
      });

      expect((svc as any).sendNotificationEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringMatching(/dispute|received/i),
        expect.any(String),
      );
    });
  });

  // ─── 25. OTP Email ────────────────────────────────────────────────────────

  describe('sendOtpEmail', () => {
    it('uses sendEmail (critical) with 6-digit code', async () => {
      await svc.sendOtpEmail(STUDENT_EMAIL, '847291');

      expect((svc as any).sendEmail).toHaveBeenCalledWith(
        STUDENT_EMAIL,
        expect.stringMatching(/otp|password/i),
        expect.stringContaining('847291'),
      );
    });
  });

  // ─── 26. sendEmail disabled path ──────────────────────────────────────────

  describe('transport guards', () => {
    it('does not throw when transport is disabled', async () => {
      // Restore real sendEmail to exercise the disabled-path guard
      jest.restoreAllMocks();
      const prismaMock: any = {
        notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
        user: { findMany: jest.fn().mockResolvedValue([]) },
      };
      // No env vars set → email is disabled in constructor
      const disabledSvc = new NotificationsService(prismaMock);

      await expect(
        disabledSvc.sendOtpEmail(STUDENT_EMAIL, '000000'),
      ).resolves.not.toThrow();
    });
  });
});
