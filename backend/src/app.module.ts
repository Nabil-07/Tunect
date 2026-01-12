import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as bodyParser from 'body-parser';

import { PrismaModule } from './prisma/prisma.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BookingsModule } from './bookings/bookings.module';
import { AvailabilityModule } from './availability/availability.module';
import { StudentsModule } from './students/students.module';
import { PaymentsModule } from './payments/payments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { KycModule } from './kyc/kyc.module';
import { SearchModule } from './search/search.module';
import { AdminModule } from './admin/admin.module';
import { AdminTokensModule } from './admin-tokens/admin-tokens.module';
import { TutorsModule } from './tutors/tutors.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagesModule } from './messages/messages.module';
import { FavoritesModule } from './favorites/favorites.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { StudentProgressModule } from './student-progress/student-progress.module';
import { SessionNotesModule } from './session-notes/session-notes.module';
import { LearningGoalsModule } from './learning-goals/learning-goals.module';
import { CertificatesModule } from './certificates/certificates.module';
import { StudyMaterialsModule } from './study-materials/study-materials.module';
import { RecurringTemplatesModule } from './recurring-templates/recurring-templates.module';
import { PerformanceReportsModule } from './performance-reports/performance-reports.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { GoogleMeetModule } from './google-meet/google-meet.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { ReferralsModule } from './referrals/referrals.module';
import { WhiteboardModule } from './whiteboard/whiteboard.module';
import { CommonModule } from './common/common.module';
import { BansModule } from './bans/bans.module';

import { AppController } from './app.controller';
import { ReadyController } from './health/ready.controller';

import { ProfilesModule } from './profiles/profiles.module';

import { FinanceDashboardModule } from './finance/dashboard/finance-dashboard.module';
import { TokenLedgerModule } from './finance/ledger/token-ledger.module';
import { FinancePayoutsModule } from './finance/payouts/finance-payouts.module';
import { TutorBalancesModule } from './finance/balances/tutor-balances.module';
import { TaxModule } from './finance/tax/tax.module';
import { ReconModule } from './finance/recon/recon.module';
import { WebrtcModule } from './webrtc/webrtc.module';
import { MediasoupModule } from './mediasoup/mediasoup.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60, limit: 120 }]),
    PrismaModule,
    CommonModule,

    AuthModule,
    UsersModule,
    BookingsModule,
    TutorsModule,
    AvailabilityModule,
    StudentsModule,
    PaymentsModule,
    ReviewsModule,
    KycModule,
    SearchModule,
    AdminModule,
    AdminTokensModule,

    NotificationsModule,
    MessagesModule,
    ProfilesModule,
    FavoritesModule,
    AttachmentsModule,
    StudentProgressModule,
    SessionNotesModule,
    LearningGoalsModule,
    CertificatesModule,
    StudyMaterialsModule,
    RecurringTemplatesModule,
    PerformanceReportsModule,
    WaitlistModule,
    GoogleMeetModule,
    AssignmentsModule,
    ReferralsModule,
    WhiteboardModule,
    BansModule,

    FinanceDashboardModule,
    TokenLedgerModule,
    FinancePayoutsModule,
    TutorBalancesModule,
    TaxModule,
    ReconModule,
    WebrtcModule,
    MediasoupModule,
  ],
  controllers: [AppController, ReadyController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Ensure Razorpay webhook gets the RAW body for signature verification,
    // *and* keep JSON parsing available for handler logic.
    consumer
      .apply(
        bodyParser.json({
          verify: (req: any, _res, buf) => {
            // save raw body buffer for signature verification
            req.rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || '');
          },
        }),
      )
      .forRoutes('payments/razorpay/webhook');
  }
}
