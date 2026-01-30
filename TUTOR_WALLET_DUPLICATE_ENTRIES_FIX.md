# Tutor Wallet Duplicate Entries - Root Cause & Fix

## 🐛 The Problem

The tutor's earnings are showing **₹14,790.36** instead of the expected **₹5,059.86**. 

**Root Cause:** Duplicate ledger entries for the same bookings being created, inflating the wallet balance by nearly 3x.

### Example from Data:
- User has 13 completed bookings
- Each booking should credit: ₹389.22 to wallet
- Expected total: 13 × ₹389.22 = **₹5,059.86**
- Actual showing: **₹14,790.36** (nearly 3x more)

The ledger shows duplicate entries:
- Most bookings appear **2 times** in the ledger with same delta
- One booking has ₹3892.2 credited **2 times**

## 🔍 Root Cause Analysis

### Two Functions Create Ledger Entries:

1. **`bookings.service.complete(id)`** (Line 1086)
   - Called when tutor manually marks a session as complete
   - Creates wallet ledger entry immediately

2. **`tutor-wallet.service.ensureCompletedBookingsCredited(tutorId)`** (Line 18)
   - Called EVERY TIME wallet is fetched (`getMyWallet()`, `getMyLedger()`)
   - Auto-creates ledger entries for any completed bookings not yet in ledger
   - **NO UNIQUE CONSTRAINT** prevents duplicates

### Why Duplicates Occur:

```
Scenario 1: Race Condition
└─ Booking completed → ledger entry created in bookings.service
└─ Before entry replicates, ensureCompletedBookingsCredited() runs
└─ Entry doesn't see the new ledger entry yet → creates another one

Scenario 2: Multiple Wallet Accesses
└─ Booking status = CONFIRMED but already has ledger entry
└─ ensureCompletedBookingsCredited() called (wallet fetched)
└─ Check looks for `reason = 'BOOKING_EARNED'` but entry exists
└─ Creates duplicate because of missing uniqueness constraint
```

### Database Level Issue:

The `TutorWalletLedger` table has NO unique constraint:
```prisma
model TutorWalletLedger {
  id        String
  tutorId   String
  bookingId String?
  delta     Decimal
  reason    WalletReason
  
  @@index([bookingId])
  @@index([tutorId, createdAt])
  // ❌ MISSING: @@unique([tutorId, bookingId, reason])
}
```

This allows multiple entries with identical `(tutorId, bookingId, reason)`.

## ✅ Solution Implemented

### 1. Added Idempotency Check in `bookings.service.complete()`

**File:** `backend/src/bookings/bookings.service.ts` (Line ~1078)

```typescript
// Check if ledger entry already exists for this booking to prevent duplicates
const existingLedger = await tx.tutorWalletLedger.findFirst({
  where: {
    tutorId: b.tutor.id,
    bookingId: b.id,
    reason: 'BOOKING_EARNED',
  },
});

if (!existingLedger) {
  // Only create wallet entry and ledger if it doesn't exist
  await tx.tutorWallet.upsert(...);
  await tx.tutorWalletLedger.create(...);
}
```

### 2. Added Unique Constraint in Prisma Schema

**File:** `backend/prisma/schema.prisma` (Line ~890)

```prisma
model TutorWalletLedger {
  // ... fields ...
  
  @@unique([tutorId, bookingId, reason], where: { bookingId != null })
}
```

This prevents duplicates at the database level:
- Same tutor + same booking + same reason = only 1 entry allowed
- `where: { bookingId != null }` because adjustments may not have bookingId

### 3. Created Cleanup Script

**File:** `backend/fix_duplicate_ledger_entries.sql`

Removes existing duplicates and recalculates wallet balances:
1. Identifies duplicates (bookings credited multiple times)
2. Keeps only the first entry per (tutorId, bookingId, reason)
3. Deletes all duplicate entries
4. Recalculates wallet balances from ledger

## 📋 Migration Steps

1. **Backup database** (⚠️ CRITICAL)
   ```bash
   pg_dump tunect_db > backup_$(date +%Y%m%d).sql
   ```

2. **Run cleanup script** (optional, if you want to fix existing data)
   ```bash
   psql tunect_db < fix_duplicate_ledger_entries.sql
   ```

3. **Create Prisma migration**
   ```bash
   cd backend
   npx prisma migrate dev --name add_unique_wallet_ledger_constraint
   ```

4. **Test the application**
   - Manually complete a booking
   - Check wallet balance (should match ledger sum)
   - Verify no duplicates created

## 🧪 Testing

### Test Case 1: Prevent Future Duplicates
```javascript
// Complete same booking twice (should fail on second attempt or be idempotent)
POST /bookings/{id}/complete
POST /bookings/{id}/complete  // Should not create duplicate ledger entry
```

### Test Case 2: Verify Wallet Accuracy
```javascript
// Check that wallet balance = sum of ledger deltas
GET /tutors/me/wallet
GET /tutors/me/ledger

// Expected: wallet.balance = sum(ledger[*].delta)
```

### Test Case 3: Unique Constraint
```javascript
// Try to insert duplicate manually (should fail)
INSERT INTO "TutorWalletLedger" 
  (id, tutorId, bookingId, delta, reason)
VALUES 
  ('new1', 'tutor1', 'booking1', 389.22, 'BOOKING_EARNED'),
  ('new2', 'tutor1', 'booking1', 389.22, 'BOOKING_EARNED');
// Expected: Unique constraint violation
```

## 📊 Impact

- ✅ Fixes incorrect earning calculations
- ✅ Prevents future duplicate ledger entries
- ✅ Ensures wallet balance = sum of ledger
- ✅ Adds database-level data integrity
- ✅ Makes functions idempotent (safe to retry)

## 🚀 Deployment Notes

1. This is a **backwards-compatible** change
2. The unique constraint with `where: { bookingId != null }` only affects booking-related entries
3. Adjustments and other ledger types can still have multiple entries
4. Run cleanup script on production **before** deploying code changes
5. Verify wallet balances after cleanup to ensure correctness

