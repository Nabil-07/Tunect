# Cancellation & Refund Policy Update

## Summary
Updated the cancellation and refund policy to implement a tiered refund system based on timing, with special handling for different booking types.

## New Policy Details

### Student Cancellations (Time-Based Refunds)

1. **Awaiting Slot Selection (PENDING_SLOT)**: 
   - **Refund**: 100%
   - **Reason**: No time slot has been assigned yet

2. **48+ Hours Before Scheduled Time**:
   - **Refund**: 100%
   - **Message**: "100% refund - Cancelled 48+ hours before the session."

3. **24-48 Hours Before Scheduled Time**:
   - **Refund**: 50%
   - **Message**: "50% refund - Cancelled 24-48 hours before the session."

4. **Less Than 24 Hours Before Scheduled Time**:
   - **Refund**: 0%
   - **Message**: "No refund - Must cancel at least 24 hours before the session."

5. **Group Sessions**:
   - **Refund**: 0% (Non-refundable)
   - **Message**: "Group sessions are non-refundable."

6. **Demo Sessions**:
   - **Refund**: N/A (Free sessions)
   - **Message**: "This is a free demo session. No refund applies."

### Tutor Cancellations
- **Refund**: 110% (Full refund + 10% bonus)
- **Applied to**: Student's token balance

### After Session Starts
- **No-Shows**: 0% refund
- **Session in Progress/Completed**: Cannot cancel

## Technical Implementation

### Backend Changes

#### File: `backend/src/bookings/bookings.service.ts`

**Method: `cancel()`**
- Added 48-hour tier check for 100% refund
- Modified 24-hour tier to give 50% refund (previously 100%)
- Added group session check for 0% refund
- PENDING_SLOT bookings (no time selected) get full refund

```typescript
// Student cancellation: time-based refund
if (hoursUntilStart >= 48) {
  // 48+ hours before: 100% refund
  refundAmount = charged;
} else if (hoursUntilStart >= 24) {
  // 24-48 hours before: 50% refund
  refundAmount = Math.floor(charged * 0.5);
} else {
  // Less than 24 hours: No refund
  refundAmount = 0;
}

// No refund for group sessions
if (booking.isGroupSession) {
  refundAmount = 0;
}
```

**Method: `assignSlot()`**
- Token deduction logic implemented when assigning slot to PENDING_SLOT booking
- Checks tutor-specific token balance
- Deducts tokens from both global and tutor-specific balance
- Creates ledger entry for audit trail
- Updates `tokensCharged` field on booking

### Frontend Changes

#### File: `Frontend/src/pages/student/bookings.tsx`

**Function: `calculateRefundInfo()`**
- Returns refund percentage and user-friendly message
- Checks for:
  - Demo sessions (free, no refund)
  - Group sessions (non-refundable)
  - PENDING_SLOT (100% refund)
  - Time-based tiers (48hrs, 24hrs)

**Function: `handleCancel()`**
- Shows confirmation modal with appropriate refund message
- Calls backend cancel endpoint
- Refreshes token balance after successful cancellation

**BookingCard Component**
- Price display fixed to show: `hourlyRate × tokensCharged`
- Demo sessions display ₹0
- Paid sessions show actual cost based on tutor's rate

#### File: `Frontend/src/pages/student/dashboard.tsx`

- Added `initialLoading` state with 600ms spinner
- Provides professional loading screen after login

#### File: `Frontend/src/pages/terms.tsx`

Updated Section 3.2 (Cancellation & Refund Policy) to include:
- All refund tiers with percentages
- Group session policy (non-refundable)
- Awaiting slot selection policy (100% refund)
- Demo session policy (free, no tokens)
- Tutor cancellation compensation
- Note about slot release for other students

### Environment Changes

#### File: `backend/.env`

```
JWT_EXPIRES_IN=30d
```
- Extended from 7 days to 30 days
- Prevents token expiry during long study sessions or meetings

## User Experience Improvements

1. **Clear Communication**: Users see exactly what refund they'll receive before confirming cancellation

2. **Fair Policy**: Graduated refunds encourage advance notice while being fair to last-minute emergencies

3. **Token Balance Updates**: Refunds automatically update both global and tutor-specific token balances

4. **Slot Release**: Cancelled slots are automatically released and become available for other students

5. **Audit Trail**: All token movements are recorded in TokenLedger for transparency

## Testing Checklist

- [ ] Cancel PENDING_SLOT booking → Verify 100% refund (8.0 → 9.0 tokens)
- [ ] Cancel booking 48+ hours before → Verify 100% refund
- [ ] Cancel booking 24-48 hours before → Verify 50% refund
- [ ] Cancel booking <24 hours before → Verify 0% refund
- [ ] Attempt to cancel group booking → Verify 0% refund
- [ ] Verify cancelled slot appears in tutor's availability
- [ ] Verify other students can book the released slot
- [ ] Verify demo cancellation shows appropriate message
- [ ] Verify JWT tokens last 30 days
- [ ] Verify dashboard loading spinner appears after login
- [ ] Verify booking prices display correctly (₹500 not ₹1)

## Deployment Notes

1. Backend and frontend servers restarted with new changes
2. No database migration required (uses existing fields)
3. Token ledger entries created for all refunds (audit trail)
4. Terms & Conditions page updated with new policy

## Support Documentation

Users can now refer to the Terms & Conditions page (Section 3.2) for detailed refund policy information. All cancellation confirmation modals display the specific refund amount and reason.
