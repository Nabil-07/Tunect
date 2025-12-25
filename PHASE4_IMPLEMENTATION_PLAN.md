# Phase 4 Implementation - Complete Requirements

## ✅ Completed
1. **Backend Schema Updates**
   - Added `pricePerToken` to `TutorTokenBalance` model
   - Migration applied to database
   - Prisma client regenerated

2. **Backend Features (Already Built)**
   - Group Sessions API endpoints
   - Waitlist system with priority queue
   - Recurring bookings with cron automation
   - Google Meet integration

## 🚧 Remaining Implementation

### Backend Updates Required

#### 1. Token Economics Implementation

**File: `backend/src/bookings/bookings.service.ts`**

Update `joinGroupSession()` method:
```typescript
// Current: Charges 1 full token
// New: Charge 0.5 tokens per student for group sessions

async joinGroupSession(bookingId: string, studentId: string) {
  // Get student's token balance with locked price
  const balance = await this.prisma.tutorTokenBalance.findUnique({
    where: { studentId_tutorId: { studentId, tutorId: booking.tutorId } },
    select: { balance: true, pricePerToken: true }
  });
  
  const GROUP_SESSION_TOKEN_COST = 0.5; // Half token for group sessions
  
  if (balance.balance < GROUP_SESSION_TOKEN_COST) {
    throw new BadRequestException(`Insufficient tokens. Need ${GROUP_SESSION_TOKEN_COST} tokens.`);
  }
  
  // Deduct 0.5 tokens
  await this.prisma.tutorTokenBalance.update({
    where: { studentId_tutorId: { studentId, tutorId: booking.tutorId } },
    data: { balance: { decrement: GROUP_SESSION_TOKEN_COST } }
  });
  
  // Create group participant record with price tracking
  await this.prisma.groupBookingParticipant.create({
    data: {
      bookingId,
      studentId,
      tokensPaid: GROUP_SESSION_TOKEN_COST,
      pricePerToken: balance.pricePerToken, // Lock in the student's token price
      status: 'ENROLLED'
    }
  });
  
  // Calculate payout: 0.5 tokens * student's locked price
  const payoutAmount = GROUP_SESSION_TOKEN_COST * balance.pricePerToken;
  
  // Add to tutor wallet
  await this.prisma.tutorWallet.update({
    where: { tutorId: booking.tutorId },
    data: { balance: { increment: payoutAmount } }
  });
  
  // Track in ledger for weekly payout calculation
  await this.prisma.tutorWalletLedger.create({
    data: {
      tutorId: booking.tutorId,
      bookingId,
      delta: payoutAmount,
      reason: 'BOOKING_CHARGE',
      note: `Group session join: ${GROUP_SESSION_TOKEN_COST} tokens × ₹${balance.pricePerToken}`
    }
  });
}
```

#### 2. Slot Conversion Feature

**New Endpoint: `PATCH /bookings/:id/convert-to-group`**

```typescript
async convertToGroupSession(
  bookingId: string,
  tutorId: string,
  maxStudents: number,
  pricePerStudent: number
) {
  const booking = await this.prisma.booking.findUnique({
    where: { id: bookingId },
    include: { student: true }
  });
  
  // Validation rules
  const hoursUntilSession = differenceInHours(booking.startTime, new Date());
  if (hoursUntilSession < 24) {
    throw new BadRequestException('Cannot convert to group session within 24 hours of start time');
  }
  
  if (booking.status !== 'PENDING_SLOT') {
    throw new BadRequestException('Can only convert unbooked slots to group sessions');
  }
  
  // Convert to group session
  await this.prisma.booking.update({
    where: { id: bookingId },
    data: {
      isGroupSession: true,
      maxStudents,
      currentEnrollment: 0,
      pricePerStudent,
      studentId: null // Remove placeholder student
    }
  });
}
```

#### 3. Update Payment Service

**File: `backend/src/payments/payments.service.ts`**

When student purchases tokens, lock in the current tutor price:

```typescript
async createOrder(studentId: string, tutorId: string, tokens: number) {
  const tutor = await this.prisma.tutor.findUnique({
    where: { id: tutorId },
    select: { hourlyRate: true }
  });
  
  const pricePerToken = tutor.hourlyRate; // Lock in current price
  const amount = tokens * pricePerToken;
  
  // After payment verification:
  await this.prisma.tutorTokenBalance.upsert({
    where: { studentId_tutorId: { studentId, tutorId } },
    update: { balance: { increment: tokens } },
    create: {
      studentId,
      tutorId,
      balance: tokens,
      pricePerToken // Store locked-in price
    }
  });
}
```

### Frontend UI Components

#### 1. Tutor Calendar with Group Session Creation

**File: `Frontend/src/pages/tutor/calendar.tsx`**

Features:
- Full calendar view (react-big-calendar)
- Click empty slot → Create session modal (1:1 or group)
- Click existing 1:1 slot (>24hrs away) → Convert to group option
- Show enrollment count on group sessions (2/5)
- Color coding: Blue=1:1, Green=Group, Yellow=Demo

```typescript
// Sample structure:
const CalendarView = () => {
  const [events, setEvents] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const handleSelectSlot = (slotInfo) => {
    // Check if >24hrs away
    const hoursAway = (slotInfo.start - new Date()) / (1000 * 60 * 60);
    setSelectedSlot({ ...slotInfo, canConvert: hoursAway > 24 });
    setShowCreateModal(true);
  };
  
  return (
    <div>
      <Calendar
        events={events}
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        views={['month', 'week', 'day']}
      />
      {showCreateModal && <CreateSessionModal />}
    </div>
  );
};
```

#### 2. Student Group Session Browse Page

**File: `Frontend/src/pages/student/group-sessions.tsx`**

Features:
- Grid of available group sessions
- Show: Subject, Time, Tutor name, Enrollment (2/5)
- Join button (disabled if full or insufficient tokens)
- Show required tokens: 0.5
- Filter by subject, date range

```typescript
const GroupSessionsPage = () => {
  const [sessions, setSessions] = useState([]);
  const [myTokenBalances, setMyTokenBalances] = useState({});
  
  const handleJoin = async (sessionId, tutorId) => {
    const balance = myTokenBalances[tutorId];
    if (balance < 0.5) {
      toast.error('Insufficient tokens. Need 0.5 tokens to join.');
      return;
    }
    
    await api.post(`/bookings/${sessionId}/join`);
    toast.success('Successfully joined group session!');
  };
  
  return (
    <div className="grid grid-cols-3 gap-4">
      {sessions.map(session => (
        <SessionCard
          key={session.id}
          session={session}
          enrollment={`${session.currentEnrollment}/${session.maxStudents}`}
          onJoin={() => handleJoin(session.id, session.tutorId)}
          disabled={session.currentEnrollment >= session.maxStudents}
        />
      ))}
    </div>
  );
};
```

#### 3. Group Session Participant List

**File: `Frontend/src/components/GroupParticipants.tsx`**

Features:
- Show only participant names (no email/ID)
- Avatar + Name only
- For tutors: Show all enrolled students
- For students: Show count + names of other students

```typescript
const GroupParticipants = ({ bookingId, userRole }) => {
  const [participants, setParticipants] = useState([]);
  
  useEffect(() => {
    api.get(`/bookings/${bookingId}/participants`).then(setParticipants);
  }, [bookingId]);
  
  return (
    <div className="space-y-2">
      <h3>Participants ({participants.length})</h3>
      {participants.map(p => (
        <div key={p.id} className="flex items-center gap-2">
          <Avatar src={p.student.user.avatarUrl} />
          <span>{p.student.user.name}</span>
          {/* Do NOT show email or student ID */}
        </div>
      ))}
    </div>
  );
};
```

#### 4. Admin Payout Dashboard

**File: `Frontend/src/pages/admin/payouts.tsx`**

Features:
- Weekly payout summary per tutor
- Breakdown by student token prices
- Show calculation: "Student A: 0.5 tokens × ₹100 = ₹50"
- Export to CSV

```typescript
const PayoutDashboard = () => {
  const [payouts, setPayouts] = useState([]);
  
  // Example payout structure:
  // {
  //   tutorId: "xxx",
  //   tutorName: "Tutor Z",
  //   totalAmount: 325,
  //   breakdown: [
  //     { studentName: "Student A", tokens: 0.5, pricePerToken: 100, amount: 50 },
  //     { studentName: "Student B", tokens: 0.5, pricePerToken: 100, amount: 50 },
  //     { studentName: "Student C", tokens: 0.5, pricePerToken: 100, amount: 50 },
  //     { studentName: "Student D", tokens: 0.5, pricePerToken: 150, amount: 75 },
  //     { studentName: "Student E", tokens: 0.5, pricePerToken: 200, amount: 100 },
  //   ]
  // }
  
  return (
    <div>
      <h1>Weekly Payouts</h1>
      {payouts.map(payout => (
        <PayoutCard key={payout.tutorId} payout={payout} />
      ))}
    </div>
  );
};
```

### Database Schema Updates Needed

**Add pricePerToken to GroupBookingParticipant:**

```sql
ALTER TABLE "GroupBookingParticipant" 
ADD COLUMN "pricePerToken" DECIMAL(10,2);
```

## Implementation Order

1. ✅ Add `pricePerToken` to `TutorTokenBalance` (DONE)
2. Update `payments.service.ts` to store locked price on purchase
3. Update `bookings.service.ts` group session join logic (0.5 tokens + price tracking)
4. Add slot conversion endpoint with validation
5. Update `GroupBookingParticipant` schema to track price
6. Build tutor calendar UI
7. Build student group sessions browse page
8. Build participant list component
9. Build admin payout dashboard
10. Test end-to-end flow

## Key Business Rules

1. **Token Economics**
   - 1 token = 1 private session (1 hour)
   - 0.5 tokens = 1 group session slot
   - Tokens are tutor-specific
   - Price locked at purchase time

2. **Slot Conversion**
   - Only convert if >24 hours before session
   - Only convert if no student has booked (status = PENDING_SLOT)
   - Cannot convert back to 1:1 once changed to group

3. **Group Sessions**
   - 2-10 students max
   - Show enrollment count (2/5, 5/5)
   - No more joins when full
   - Show only participant names (no email/ID)

4. **Payout Calculation**
   - Each student's tokens charged at their locked-in price
   - Example: 5 students × 0.5 tokens = 2.5 tokens total
   - But payout varies by each student's price
   - Track in `TutorWalletLedger` for weekly reconciliation

## Testing Scenarios

1. Student A buys 10 tokens at ₹100/token
2. Student B buys 10 tokens at ₹150/token  
3. Tutor creates group session (max 5 students)
4. Students A & B join → Tutor gets ₹50 + ₹75 = ₹125
5. Admin sees breakdown in payout dashboard
6. Weekly payout generated from `TutorWalletLedger`
