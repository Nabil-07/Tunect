// INTEGRATION GUIDE: Chat System Triggers
// Add these imports and calls to your bookings service

/* 
 * Step 1: Import ChatTriggersService in bookings.service.ts
 */
// At the top of bookings.service.ts, add:
import { ChatTriggersService } from '../messages/chat-triggers.service';

/*
 * Step 2: Inject ChatTriggersService in the constructor
 */
constructor(
  private prisma: PrismaService,
  private notifications: NotificationsService,
  private googleMeet: GoogleMeetService,
  private waitlistService: WaitlistService,
  private chatTriggers: ChatTriggersService, // ADD THIS
) {}

/*
 * Step 3: Call triggers after booking creation
 */

// After creating a DIRECT booking (in create() method):
const booking = await this.prisma.booking.create({
  data: { /* ... */ },
  include: {
    student: { select: { userId: true } },
    tutor: { select: { userId: true } },
  },
});

// Trigger chat creation
try {
  await this.chatTriggers.onDirectBookingCreated(
    booking.id,
    booking.tutor.userId,
    booking.student.userId,
  );
} catch (error) {
  // Log but don't fail the booking
  console.error('Failed to create chat:', error);
}

/*
 * Step 4: Trigger for GROUP bookings
 */

// After creating/joining a group booking (in createGroupBooking() or joinGroupBooking()):
const groupBooking = await this.prisma.groupBooking.create({
  data: { /* ... */ },
});

const participant = await this.prisma.groupParticipant.create({
  data: {
    groupBookingId: groupBooking.id,
    studentId: dto.studentId,
    /* ... */
  },
  include: {
    student: { select: { userId: true } },
    groupBooking: {
      select: {
        tutor: { select: { userId: true } },
      },
    },
  },
});

// Trigger chat creation/update
try {
  await this.chatTriggers.onGroupBookingCreated(
    groupBooking.id,
    participant.groupBooking.tutor.userId,
    participant.student.userId,
  );
} catch (error) {
  console.error('Failed to create/update group chat:', error);
}

/*
 * Step 5: Trigger for CANCELLATION
 */

// In delete() or cancel booking methods:
const booking = await this.prisma.booking.findUnique({
  where: { id },
  include: {
    student: { select: { userId: true } },
    groupBookingParticipants: true,
  },
});

if (booking?.groupBookingParticipants?.length) {
  // Group booking cancellation
  try {
    await this.chatTriggers.onGroupBookingCancelled(
      booking.id,
      booking.student.userId,
    );
  } catch (error) {
    console.error('Failed to update group chat:', error);
  }
}

/*
 * Step 6: Update BookingsModule
 */

// In bookings.module.ts, import MessagesModule:
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    GoogleMeetModule,
    WaitlistModule,
    MessagesModule, // ADD THIS
  ],
  // ...
})
export class BookingsModule {}
