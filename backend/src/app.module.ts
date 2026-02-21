import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as bodyParser from 'body-parser';

import { PrismaModule } from './prisma/prisma.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BookingsModule } from './bookings/bookings.module';
import { AvailabilityModule } from './availability/availability.module';
import { StudentsModule } from './students/students.module';
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
import { SupportModule } from './support/support.module';
import { StatsModule } from './stats/stats.module';
import { BlogsModule } from './blogs/blogs.module';
import { RefundsModule } from './refunds/refunds.module';

import { AppController } from './app.controller';
import { ReadyController } from './health/ready.controller';
import { HealthModule } from './health/health.module';

import { ProfilesModule } from './profiles/profiles.module';

import { FinanceDashboardModule } from './finance/dashboard/finance-dashboard.module';
import { TokenLedgerModule } from './finance/ledger/token-ledger.module';
import { FinancePayoutsModule } from './finance/payouts/finance-payouts.module';
import { TutorBalancesModule } from './finance/balances/tutor-balances.module';
import { PaymentsModule } from './finance/payments/payments.module';
import { TaxModule } from './finance/tax/tax.module';
import { ReconModule } from './finance/recon/recon.module';
import { LivekitModule } from './livekit/livekit.module';
import { TasksModule } from './tasks/tasks.module';
import { MetricsModule } from './metrics/metrics.module';
import { PreprodInternalGuard } from './auth/preprod-internal.guard';
import { EncryptResponseInterceptor } from './common/interceptors/encrypt-response.interceptor';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { UploadsModule } from './uploads/uploads.module';
import { PolicyConfigModule } from './policy-config/policy-config.module';
import { AdminControlsModule } from './admin-controls/admin-controls.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60, limit: 120 }]),
    PrismaModule,
    CommonModule,
    UploadsModule,
    PolicyConfigModule,
    AdminControlsModule,
    HealthModule,
    MetricsModule,

    AuthModule,
    UsersModule,
    BookingsModule,
    TutorsModule,
    AvailabilityModule,
    StudentsModule,
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
    SupportModule,
    StatsModule,
    BlogsModule,
    RefundsModule,

    FinanceDashboardModule,
    TokenLedgerModule,
    FinancePayoutsModule,
    TutorBalancesModule,
    PaymentsModule,
    TaxModule,
    ReconModule,
    LivekitModule,
    TasksModule,
  ],
  controllers: [AppController, ReadyController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: EncryptResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    PreprodInternalGuard,
  ],
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
