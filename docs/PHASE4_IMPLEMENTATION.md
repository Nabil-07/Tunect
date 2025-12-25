# Phase 4: Enhanced Booking Features - Implementation Plan

## Overview
Phase 4 adds advanced booking capabilities including group sessions, recurring bookings, waitlist management, and Google Meet integration.

## Database Schema Changes ✅ COMPLETED

### 1. Booking Model Enhancements
```prisma
model Booking {
  // Group Session Fields
  isGroupSession    Boolean  @default(false)
  maxStudents       Int      @default(1)
  currentEnrollment Int      @default(1)
  pricePerStudent   Decimal? @db.Decimal(18, 2)
  
  // Google Meet Integration
  meetingUrl      String?
  meetingProvider String? @default("google_meet")
  
  // Recurring Booking Link
  recurringTemplateId String?
  recurringTemplate   RecurringTemplate? @relation(fields: [recurringTemplateId], references: [id])
  
  // Relations
  groupParticipants GroupBookingParticipant[]
}
```

### 2. New Models

#### GroupBookingParticipant
```prisma
model GroupBookingParticipant {
  id         String   @id @default(uuid())
  bookingId  String
  studentId  String
  joinedAt   DateTime @default(now())
  tokensPaid Decimal  @default(0.00) @db.Decimal(18, 2)
  status     String   @default("ENROLLED") // ENROLLED, DROPPED, COMPLETED
  
  booking    Booking  @relation(fields: [bookingId], references: [id])
  student    Student  @relation(fields: [studentId], references: [id])
}
```

#### Waitlist
```prisma
model Waitlist {
  id                 String    @id @default(uuid())
  tutorId            String
  studentId          String
  requestedStartTime DateTime
  requestedEndTime   DateTime
  subject            String?
  priority           Int       @default(0)
  status             String    @default("WAITING") // WAITING, NOTIFIED, EXPIRED, BOOKED
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  notifiedAt         DateTime?
  expiresAt          DateTime?
  
  tutor              Tutor     @relation(fields: [tutorId], references: [id])
  student            Student   @relation(fields: [studentId], references: [id])
}
```

#### RecurringTemplate Updates
```prisma
model RecurringTemplate {
  // Existing fields...
  
  // New Fields for Auto-Generation
  lastGeneratedDate   DateTime?
  nextGenerationDate  DateTime?
  maxGroupSize        Int       @default(1)
  isGroupSession      Boolean   @default(false)
  
  // Relation to generated bookings
  generatedBookings   Booking[]
}
```

## Backend Implementation

### Feature 1: Group Sessions

#### Files to Create/Modify:
1. **backend/src/bookings/dto/create-group-booking.dto.ts**
```typescript
export class CreateGroupBookingDto {
  tutorId: string;
  startTime: Date;
  endTime: Date;
  subject: string;
  maxStudents: number;
  pricePerStudent: number;
  isDemo?: boolean;
}

export class JoinGroupBookingDto {
  bookingId: string;
  studentId: string;
}
```

2. **backend/src/bookings/bookings.service.ts**
- Add `createGroupSession(dto: CreateGroupBookingDto)`
- Add `joinGroupSession(bookingId: string, studentId: string)`
- Add `leaveGroupSession(bookingId: string, studentId: string)`
- Add `getGroupSessionParticipants(bookingId: string)`
- Update `createBooking()` to handle group sessions
- Implement split payment logic in `chargeTokens()`

3. **backend/src/bookings/bookings.controller.ts**
```typescript
@Post('group')
@UseGuards(JwtAuthGuard)
createGroupSession(@Body() dto: CreateGroupBookingDto, @Req() req) {
  return this.bookingsService.createGroupSession(dto, req.user.tutorId);
}

@Post(':id/join')
@UseGuards(JwtAuthGuard)
joinGroupSession(@Param('id') id: string, @Req() req) {
  return this.bookingsService.joinGroupSession(id, req.user.studentId);
}

@Delete(':id/leave')
@UseGuards(JwtAuthGuard)
leaveGroupSession(@Param('id') id: string, @Req() req) {
  return this.bookingsService.leaveGroupSession(id, req.user.studentId);
}

@Get(':id/participants')
getParticipants(@Param('id') id: string) {
  return this.bookingsService.getGroupSessionParticipants(id);
}
```

### Feature 2: Recurring Bookings

#### Files to Create/Modify:
1. **backend/src/recurring-templates/recurring-templates.service.ts**
- Add `generateBookingsForTemplate(templateId: string, weeksAhead: number)`
- Add `scheduleRecurringGeneration()` - Cron job to auto-generate bookings
- Update templates to track `lastGeneratedDate` and `nextGenerationDate`

2. **backend/src/recurring-templates/recurring-templates.controller.ts**
```typescript
@Post(':id/generate')
@UseGuards(JwtAuthGuard)
generateBookings(@Param('id') id: string, @Body() dto: { weeksAhead: number }) {
  return this.service.generateBookingsForTemplate(id, dto.weeksAhead);
}
```

3. **backend/src/app.module.ts**
- Import @nestjs/schedule
- Add ScheduleModule.forRoot()

4. **backend/src/recurring-templates/recurring.scheduler.ts** (NEW FILE)
```typescript
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class RecurringBookingsScheduler {
  constructor(private readonly templatesService: RecurringTemplatesService) {}
  
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateRecurringBookings() {
    // Find templates needing generation
    // Generate bookings for next 2 weeks
    // Update nextGenerationDate
  }
}
```

### Feature 3: Waitlist Management

#### Files to Create:
1. **backend/src/waitlist/waitlist.module.ts**
2. **backend/src/waitlist/waitlist.service.ts**
```typescript
class WaitlistService {
  async addToWaitlist(dto: AddToWaitlistDto) {
    // Create waitlist entry
    // Set priority based on request time
  }
  
  async notifyWhenAvailable(waitlistId: string) {
    // Send notification to student
    // Mark as NOTIFIED
    // Set expiration time (e.g., 24 hours)
  }
  
  async processWaitlist(bookingId: string) {
    // When booking is cancelled, find matching waitlist entries
    // Notify top priority student
  }
  
  async bookFromWaitlist(waitlistId: string, studentId: string) {
    // Convert waitlist entry to actual booking
    // Mark as BOOKED
  }
}
```

3. **backend/src/waitlist/waitlist.controller.ts**
```typescript
@Post()
@UseGuards(JwtAuthGuard)
addToWaitlist(@Body() dto: AddToWaitlistDto, @Req() req) {
  return this.service.addToWaitlist({...dto, studentId: req.user.studentId});
}

@Get('my')
@UseGuards(JwtAuthGuard)
getMyWaitlist(@Req() req) {
  return this.service.getStudentWaitlist(req.user.studentId);
}

@Post(':id/book')
@UseGuards(JwtAuthGuard)
bookFromWaitlist(@Param('id') id: string, @Req() req) {
  return this.service.bookFromWaitlist(id, req.user.studentId);
}

@Delete(':id')
@UseGuards(JwtAuthGuard)
removeFromWaitlist(@Param('id') id: string) {
  return this.service.removeFromWaitlist(id);
}
```

4. **backend/src/waitlist/dto/add-to-waitlist.dto.ts**
```typescript
export class AddToWaitlistDto {
  tutorId: string;
  requestedStartTime: Date;
  requestedEndTime: Date;
  subject?: string;
}
```

### Feature 4: Google Meet Integration

#### Files to Create:
1. **backend/src/google-meet/google-meet.module.ts**
2. **backend/src/google-meet/google-meet.service.ts**
```typescript
import { google } from 'googleapis';

class GoogleMeetService {
  private calendar;
  
  constructor(private configService: ConfigService) {
    const auth = new google.auth.GoogleAuth({
      keyFile: this.configService.get('GOOGLE_SERVICE_ACCOUNT_KEY'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    
    this.calendar = google.calendar({ version: 'v3', auth });
  }
  
  async createMeetingForBooking(booking: Booking) {
    const event = {
      summary: `Tunect Session: ${booking.subject}`,
      description: `Session with ${booking.student.user.name} and ${booking.tutor.user.name}`,
      start: {
        dateTime: booking.startTime.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: booking.endTime.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      conferenceData: {
        createRequest: {
          requestId: `tunect-${booking.id}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      attendees: [
        { email: booking.student.user.email },
        { email: booking.tutor.user.email },
      ],
    };
    
    const response = await this.calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
    });
    
    return response.data.hangoutLink;
  }
  
  async deleteMeeting(booking: Booking) {
    // Delete calendar event
  }
}
```

3. **Update backend/src/bookings/bookings.service.ts**
```typescript
async confirmBooking(bookingId: string) {
  // ... existing code
  
  // Generate Google Meet link
  if (booking.status === 'CONFIRMED') {
    const meetingUrl = await this.googleMeetService.createMeetingForBooking(booking);
    
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { meetingUrl },
    });
  }
}
```

4. **.env updates**
```
GOOGLE_SERVICE_ACCOUNT_KEY=path/to/service-account-key.json
GOOGLE_CALENDAR_ID=primary
```

## Frontend Implementation

### Feature 1: Group Sessions UI

#### Files to Create:
1. **Frontend/src/pages/student/group-sessions.tsx**
```tsx
// Browse available group sessions
// Filter by subject, date, price
// Show participant count (e.g., "3/5 students enrolled")
// Join group session button
```

2. **Frontend/src/pages/tutor/create-group-session.tsx**
```tsx
// Form to create group session
// Fields: subject, date, time, maxStudents, pricePerStudent
// Preview of total revenue potential
```

3. **Frontend/src/components/GroupSessionCard.tsx**
```tsx
// Display group session details
// Show enrolled students (for tutor)
// Show available spots (for students)
// Join/Leave buttons
```

### Feature 2: Recurring Bookings UI

#### Files to Create:
1. **Frontend/src/pages/tutor/recurring-sessions.tsx**
```tsx
// Manage recurring templates
// Preview upcoming auto-generated bookings
// Enable/disable templates
// Set group session options
```

2. **Frontend/src/components/RecurringTemplateForm.tsx**
```tsx
// Create/edit recurring template
// Day of week selector
// Time picker
// Group session toggle with max students
// Preview calendar
```

### Feature 3: Waitlist UI

#### Files to Create:
1. **Frontend/src/pages/student/my-waitlist.tsx**
```tsx
// List of waitlist entries
// Status indicators (WAITING, NOTIFIED, EXPIRED)
// Book now button when notified
// Remove from waitlist option
```

2. **Frontend/src/components/WaitlistButton.tsx**
```tsx
// Add to waitlist button (when booking full)
// Show position in queue if possible
// Notification badge when slot available
```

### Feature 4: Google Meet Integration UI

#### Files to Modify:
1. **Frontend/src/pages/student/bookings.tsx**
```tsx
// Add "Join Meeting" button for upcoming bookings
// Display meeting link
// Countdown to session start
```

2. **Frontend/src/pages/tutor/sessions.tsx**
```tsx
// Show meeting links for each session
// Quick copy meeting link button
```

3. **Frontend/src/components/BookingCard.tsx**
```tsx
// Add meeting link display
// "Join Google Meet" button
// Copy link icon
```

## API Endpoints Summary

### Group Sessions
- `POST /bookings/group` - Create group session
- `POST /bookings/:id/join` - Join group session
- `DELETE /bookings/:id/leave` - Leave group session
- `GET /bookings/:id/participants` - Get participants list
- `GET /bookings/group/available` - Browse available group sessions

### Recurring Bookings
- `POST /recurring-templates/:id/generate` - Generate bookings from template
- `GET /recurring-templates/:id/upcoming` - Preview upcoming auto-generated bookings

### Waitlist
- `POST /waitlist` - Add to waitlist
- `GET /waitlist/my` - Get my waitlist entries
- `POST /waitlist/:id/book` - Book from waitlist when notified
- `DELETE /waitlist/:id` - Remove from waitlist
- `GET /tutors/:id/waitlist` - Get tutor's waitlist (tutor only)

### Google Meet
- Automatic: Meeting links generated on booking confirmation
- `GET /bookings/:id/meeting` - Get meeting details

## Implementation Order

### Phase 1: Database & Core Backend (Week 7, Days 1-3)
1. ✅ Update Prisma schema
2. Run migrations
3. Implement Group Sessions backend
4. Implement Waitlist backend
5. Test with Postman/Thunder Client

### Phase 2: Advanced Backend (Week 7, Days 4-5)
1. Implement Recurring Bookings scheduler
2. Implement Google Meet integration
3. Update booking service for all features
4. Integration tests

### Phase 3: Frontend UI (Week 8, Days 1-3)
1. Group Sessions UI
2. Waitlist UI
3. Recurring Templates UI
4. Meeting links in booking cards

### Phase 4: Testing & Polish (Week 8, Days 4-5)
1. End-to-end testing
2. Edge case handling
3. UI/UX improvements
4. Documentation updates

## Testing Checklist

### Group Sessions
- [ ] Create group session with max 5 students
- [ ] Multiple students can join
- [ ] Student can't join when full
- [ ] Tokens split correctly among participants
- [ ] Student can leave before session
- [ ] Refund logic works

### Recurring Bookings
- [ ] Template creates bookings for next 2 weeks
- [ ] Cron job runs daily
- [ ] Group recurring sessions work
- [ ] Can disable template
- [ ] Manual generation works

### Waitlist
- [ ] Can add to waitlist when booking full
- [ ] Student notified when slot available
- [ ] Notification expires after 24 hours
- [ ] Can book from waitlist
- [ ] Priority system works (FIFO)

### Google Meet
- [ ] Meeting link generated on booking confirmation
- [ ] Link sent to both parties
- [ ] Can access meeting 15 min before start
- [ ] Meeting deleted when booking cancelled

## Environment Variables

```env
# Google Meet Integration
GOOGLE_SERVICE_ACCOUNT_KEY=/path/to/service-account-key.json
GOOGLE_CALENDAR_ID=primary

# Waitlist Settings
WAITLIST_NOTIFICATION_EXPIRY_HOURS=24
WAITLIST_MAX_NOTIFICATIONS=3

# Group Sessions
GROUP_SESSION_MAX_STUDENTS=10
GROUP_SESSION_MIN_ENROLLMENT=2

# Recurring Bookings
RECURRING_GENERATION_WEEKS_AHEAD=2
RECURRING_CRON_SCHEDULE="0 0 * * *" # Daily at midnight
```

## Next Steps

1. Start PostgreSQL database
2. Run migration: `npx prisma migrate dev --name phase4_enhanced_booking`
3. Generate Prisma client: `npx prisma generate`
4. Begin backend implementation in order listed above
5. Create frontend components once backend APIs are ready
