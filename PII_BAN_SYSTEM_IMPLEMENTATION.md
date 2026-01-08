# PII Ban & Forfeiture System Implementation

## Summary
Implemented automatic user suspension and earnings forfeiture after 3 PII (Personal Identifiable Information) violations in chat messages.

## What Was Implemented

### 1. Automatic Ban After 3 Violations
**File**: `backend/src/messages/messages.service.ts`

When a user sends a message containing PII:
1. **First 2 violations**: Message is blocked, violation logged, warning shown
2. **3rd violation**: 
   - User is banned (isBanned = true, bannedScope = 'ALL')
   - BanLedger entry created with reason 'PII_VIOLATION'
   - Automatic forfeiture triggered based on role

### 2. Tutor Earnings Forfeiture
When a tutor is banned after 3rd PII violation:
- Current wallet balance is moved to BanForfeitureLedger
- TutorWallet balance set to 0
- TutorWalletLedger entry created with reason 'FORFEITED'
- Amount appears in finance dashboard "Forfeited Tutor Earnings (Bans)" section

### 3. Student Token Forfeiture
When a student is banned after 3rd PII violation:
- All TutorTokenBalance entries for that student are zeroed out
- Total forfeited amount calculated and logged in BanForfeitureLedger
- Type: 'STUDENT_TOKEN_FORFEIT'

### 4. Admin Unban Functionality
**Backend**: `backend/src/admin/admin.controller.ts` + `admin.service.ts`
**Frontend**: Admin Tutors/Students pages

New endpoint: `POST /admin/users/:id/unban`
- Sets isBanned = false, bannedScope = null, bannedAt = null
- Marks all active BanLedger entries as lifted
- Records lift reason as 'ADMIN_UNBAN'

### 5. Admin UI Updates

#### Tutors Page (`Frontend/src/pages/admin/tutors.tsx`)
- **New Column**: "Account Status" showing:
  - 🚫 **Blocked** (red badge) with ban date for banned users
  - ✓ **Active** (green badge) for active users
- **New Action**: "Unblock" button for banned tutors

#### Students Page (`Frontend/src/pages/admin/students.tsx`)
- **New Column**: "Account Status" with same visual indicators
- **New Action**: "Unblock" button for banned students

### 6. Schema Updates
**File**: `backend/prisma/schema.prisma`

Added new WalletReason enum value:
```prisma
enum WalletReason {
  BOOKING_EARNED
  BOOKING_CHARGE
  ADJUSTMENT
  PAYOUT
  FORFEITED  // NEW - for ban forfeitures
}
```

## How It Works

### Ban Flow
```
User sends message with PII (email/phone/social media link)
    ↓
PII detection catches it
    ↓
Violation logged to PiiViolationLog
    ↓
Check violation count for user
    ↓
If violations < 3:
  - Show warning message
  - Block the message
    ↓
If violations >= 3 AND not already banned:
  - Update User.isBanned = true
  - Create BanLedger entry
  - If TUTOR: forfeit wallet balance
  - If STUDENT: forfeit all token balances
  - Create BanForfeitureLedger entry
  - Block the message
```

### Finance Dashboard Integration
The finance dashboard already queries `BanForfeitureLedger`:
- **Line Items**:
  - "Forfeited Token Revenue (Bans)" - from STUDENT_TOKEN_FORFEIT
  - "Forfeited Tutor Earnings (Bans)" - from TUTOR_EARNING_FORFEIT
- These amounts are included in equity calculations
- Properly reflected in balance sheet exports

## Testing the System

### Test Ban Flow
1. **Login as a student** (e.g., nabil.irshad@gmail.com)
2. **Go to chat** with any tutor
3. **Send 3 messages** containing PII:
   - "My email is test@gmail.com"
   - "Call me at 9876543210"
   - "DM me on Instagram @myhandle"
4. **After 3rd message**:
   - User account is banned
   - If tutor: earnings forfeited
   - If student: tokens forfeited
   - User cannot send more messages

### Verify Ban
1. **Go to Admin Dashboard** → Tutors or Students page
2. **Check Account Status column**:
   - Should show 🚫 **Blocked** with ban date
3. **Check Unblock button** appears
4. **Click Unblock** to restore account

### Verify Forfeiture
1. **Go to Admin Dashboard** → Finance
2. **Check balance sheet** under Equity section:
   - "Forfeited Token Revenue (Bans)" - for student forfeitures
   - "Forfeited Tutor Earnings (Bans)" - for tutor forfeitures
3. **Amounts should match** what was in banned users' balances

## Files Modified

### Backend
1. `backend/src/messages/messages.service.ts` - Ban and forfeiture logic
2. `backend/src/admin/admin.service.ts` - Include ban fields, unban method
3. `backend/src/admin/admin.controller.ts` - Unban endpoint
4. `backend/prisma/schema.prisma` - Added FORFEITED to WalletReason enum

### Frontend
1. `Frontend/src/pages/admin/tutors.tsx` - Account status column + unblock button
2. `Frontend/src/pages/admin/students.tsx` - Account status column + unblock button
3. `Frontend/src/services/adminService.ts` - Updated types + unbanUser function

## Database Tables Used

### Existing Tables
- `User` - isBanned, bannedScope, bannedAt fields
- `BanLedger` - Tracks ban events and lifts
- `BanForfeitureLedger` - Tracks forfeited amounts
- `PiiViolationLog` - Logs every PII violation attempt
- `TutorWallet` - Tutor earnings (zeroed on ban)
- `TutorWalletLedger` - Audit trail for tutor wallet
- `TutorTokenBalance` - Student token balances (zeroed on ban)

### Data Flow
```
PiiViolationLog (3 entries) 
    → User.isBanned = true
    → BanLedger (new entry)
    → BanForfeitureLedger (new entry with amount)
    → TutorWallet.balance = 0 OR TutorTokenBalance.balance = 0
    → Finance Dashboard reflects forfeiture
```

## Important Notes

1. **Violation Count**: System counts total violations across all time, not just recent ones
2. **Ban Scope**: Currently set to 'ALL' (user completely blocked from platform)
3. **Automatic**: No manual admin intervention needed for banning
4. **Reversible**: Admins can unblock users via admin UI
5. **Audit Trail**: All actions logged in BanLedger and BanForfeitureLedger
6. **Finance Impact**: Forfeitures immediately appear in balance sheet
7. **No Refunds**: Forfeited amounts are NOT returned when user is unbanned

## Future Enhancements (Not Implemented)

1. **Graduated Bans**: Different ban scopes for different violation counts
2. **Appeal Process**: Allow users to appeal bans
3. **Temporary Bans**: Time-limited restrictions instead of permanent
4. **Restore Forfeitures**: Option to return forfeited amounts when unbanning
5. **Email Notifications**: Notify users when they get warnings/bans
6. **Admin Notes**: Allow admins to add notes when unbanning users

## Security Considerations

1. **PII Detection**: Uses regex patterns (phone, email, URL, social media)
2. **Allowlist**: tunect.com domains are allowed (not flagged as PII)
3. **Obfuscation Detection**: Catches "at gmail dot com", spaced phone numbers, etc.
4. **Logging**: Full message content logged for audit (PiiViolationLog)
5. **Immediate Block**: Messages never reach recipient if PII detected
6. **Zero External Costs**: All detection done locally with regex (no AI APIs)

## Migration Notes

### Required Steps After Deployment
1. **Run Prisma migration**: `npx prisma migrate deploy`
   - Adds FORFEITED to WalletReason enum
2. **Regenerate Prisma client**: `npx prisma generate`
3. **Restart backend server**: New code includes ban logic
4. **Test with low-stakes account**: Verify ban flow works
5. **Monitor finance dashboard**: Ensure forfeitures appear correctly

### Rollback Plan (If Issues Occur)
1. Revert schema change: Remove FORFEITED from WalletReason
2. Revert service changes: Remove ban logic from messages.service.ts
3. Keep admin UI changes: Status column still useful for manual bans
4. Manual unban: Use database query if needed:
   ```sql
   UPDATE "User" SET "isBanned" = false, "bannedScope" = NULL, "bannedAt" = NULL WHERE id = '<user-id>';
   ```

## Support & Troubleshooting

### User Can't Send Messages After Ban
**Expected behavior** - Check admin panel to verify ban status, use Unblock if needed

### Forfeited Earnings Not Showing
**Check**: 
- BanForfeitureLedger table has entries
- Finance dashboard queries include period filter
- Server restarted after schema update

### Unblock Button Not Working
**Check**:
- User ID passed correctly
- Backend /admin/users/:id/unban endpoint accessible
- Admin has proper role/permissions
- Check browser console for error messages

### Finance Numbers Don't Match
**Check**:
- Period filter on finance dashboard
- Sum of BanForfeitureLedger entries
- TutorWallet and TutorTokenBalance entries zeroed correctly
