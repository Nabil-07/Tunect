# Earning Calculation Fixes - Complete Summary

## Problem Identified
Tutor earnings were being calculated incorrectly across the entire platform:
- **Symptom**: Tutor with ₹500/hour earning only ₹0.82 per booking instead of ₹390
- **Root Cause**: Commission calculation formula was using `tokens` (1) instead of `bookingAmount` (hourlyRate * hours)
- **Impact**: All tutors' earnings, wallet balances, and payouts were severely underestimated

### Example
For a 1-hour booking at ₹500/hour with 22% commission:
- **Wrong formula**: 1 token × (100-22)/100 = ₹0.78 ≈ ₹0.82
- **Correct formula**: (1 token × ₹500/hour) × (100-22)/100 = ₹390 ✅

---

## Commission Rate Tiers (Fixed)
| Hourly Rate | Commission | Tutor Gets |
|-------------|-----------|-----------|
| ₹0-399 | 25% | 75% |
| ₹400-699 | 22% | 78% |
| ₹700+ | 18% | 82% |

---

## Files Fixed

### 1. **`src/tutors/tutor-wallet.service.ts`**
**Lines 10-16 & 47-62**
- Fixed `platformFeePercent()` method: Corrected commission rates (22% for 400-699, 18% for 700+)
- Fixed `ensureCompletedBookingsCredited()`: Changed calculation from `tokens * (100-fee)/100` to `(hours * hourlyRate) * (100-fee)/100`

**Impact**: Auto-credits completed bookings with correct amounts

### 2. **`src/tasks/tasks.service.ts`**
**Lines 23-29 & 144-151**
- Fixed `platformFeePercent()` method: Corrected commission rates
- Fixed booking auto-completion earning calculation: Now multiplies tokens by hourlyRate before applying commission

**Impact**: Auto-completed sessions earn correct amounts

### 3. **`src/bookings/bookings.service.ts`**
**Lines 1099-1107 & 1070-1076**
- Fixed `platformFeePercent()` method: Corrected commission rates
- Fixed booking completion earning calculation: Now multiplies tokens by hourlyRate

**Impact**: Manual booking completion earns correct amounts

### 4. **`src/tutors/tutors.service.ts`**
**Lines 1014-1022 & 1025-1045**
- Fixed `platformFeePercent()` method: Corrected commission rates
- Fixed `getTutorProfile()` earnings summary: Now correctly calculates both total and monthly earnings

**Impact**: Tutor profile displays correct lifetime and monthly earnings

---

## Database Cleanup Required

### Old Entries
The wallet ledger contains old entries with wrong calculations. These need to be fixed:

**Tutor**: Aditya Anand (cmklipl3u0005pa7oist0sv54)
- **Current wallet**: ₹1.64 (from 2 entries of ₹0.82 each)
- **Correct wallet**: ₹390 (from 1 completed booking of 1 hour at ₹500/hour)

### Cleanup Script
Use the provided `fix-old-earnings.sql` to:
1. Delete incorrect ledger entries
2. Recalculate correct wallet balance
3. Re-insert ledger entries with correct amounts
4. Verify the fix

```bash
psql -d tunect_db -f fix-old-earnings.sql
```

---

## Data Flow - Where Earnings Are Calculated

### For Tutors (All now fixed):
1. ✅ **Real-time**: `tutors/tutor-wallet.service.ts` - Auto-credits completed bookings
2. ✅ **On session completion**: `tasks/tasks.service.ts` - Auto-completes and credits
3. ✅ **Manual completion**: `bookings/bookings.service.ts` - Completes booking and credits
4. ✅ **Profile summary**: `tutors/tutors.service.ts` - Shows earnings on profile
5. ✅ **Payment APIs**: `finance/payments/payments.service.ts` - Admin portal payment calculations

### For Admin Panel:
- ✅ **Tutor payouts**: `finance/payments/payments.service.ts` - Calculates due payments using correct commission rates
- ✅ **Student payments**: Tracks actual token charges

---

## Verification Checklist

- [x] All `platformFeePercent()` methods use correct rates: 25%, 22%, 18%
- [x] All earning calculations use formula: `(hours * hourlyRate) * (100-fee) / 100`
- [x] `tutor-wallet.service.ts` fixed
- [x] `tasks.service.ts` fixed
- [x] `bookings.service.ts` fixed
- [x] `tutors.service.ts` fixed
- [x] Backend compiled successfully with no errors
- [ ] Database old entries cleaned up (pending: run SQL script)
- [ ] Refresh admin portal to see corrected balance
- [ ] Refresh tutor portal to see corrected earnings

---

## Next Steps

1. **Run the SQL cleanup script** to fix existing ledger entries
2. **Test with new bookings** to ensure new earnings are calculated correctly
3. **Verify admin portal** shows correct tutor payout amounts
4. **Verify tutor portal** shows correct wallet balance and earnings
5. **Monitor**: Watch for any edge cases in multi-hour bookings or group sessions

---

## Edge Cases to Monitor

- Multi-hour bookings (e.g., 5-hour session with tokensCharged: "5")
- Demo sessions (tokensCharged: "0" - should not earn)
- Canceled bookings (should not earn)
- Banned tutors (earnings should be forfeited)
