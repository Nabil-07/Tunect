# PII Guard System - Personal Information Detection & Blocking

## Overview

The PII (Personally Identifiable Information) Guard System prevents users from sharing personal contact information (phone numbers, emails, social media handles, URLs) in chat messages to keep all communication within the Tunect platform.

## Why This Exists

**Problem**: Tutors and students might try to move communication off-platform by sharing:
- Phone numbers
- Email addresses
- WhatsApp/Telegram/Instagram handles
- Personal website links
- Social media profiles

**Solution**: Automatically detect and **BLOCK** messages containing personal information before they're sent or saved.

## How It Works

### 1. Detection Patterns

The system uses regex patterns to detect:

**Phone Numbers** (6+ formats):
- `1234567890` (10-digit)
- `123-456-7890` (dashed)
- `123.456.7890` (dotted)
- `+91 12345-67890` (international/Indian format)
- And more variants

**Email Addresses**:
- `user@example.com` (standard)
- `user @ example . com` (spaced to bypass filters)

**URLs**:
- `https://example.com`
- `www.example.com`
- `example.com` (TLD detection: .com, .org, .net, .in, .io, etc.)
- **Exception**: `tunect.com`, `localhost`, `tunect.in` are ALLOWED

**Social Media**:
- Platform names: WhatsApp, Telegram, Instagram, Facebook, Snapchat, etc.
- Handles: `@username`
- Phrases: "DM me on Instagram", "message me on WhatsApp"

**Obfuscation Attempts** (common tricks):
- `at gmail dot com` → detects "at" and "dot" substitutions
- `nine eight seven six five...` → detects spelled-out phone numbers
- `9 8 7 6 5 4 3 2 1 0` → detects spaced-out digits
- `call me at 9` → detects "call me" phrases

### 2. Enforcement Points

**Backend** (source of truth):
- `enhanced-messages.service.ts` - HTTP POST endpoint for messages
- `messages.gateway.ts` - WebSocket real-time messaging (if direct sending is added)

**Frontend** (UX only):
- Error alert displays warning message when message is blocked

### 3. Violation Logging

Every PII detection attempt is logged to the `PiiViolationLog` table:

```typescript
{
  id: string;
  userId: string;
  messageContent: string; // full message text
  violationType: string; // "PHONE, EMAIL, URL"
  detectedPatterns: JSON; // array of violation details
  action: "BLOCKED";
  createdAt: DateTime;
}
```

This creates an **audit trail** for compliance and reviewing patterns.

### 4. Warning Messages

**For Tutors**:
```
⚠️ WARNING: Sharing personal contact information (phone, email, social media) 
is strictly prohibited. Violations will result in immediate account suspension, 
earnings being blocked, and funds will not be disbursed. This message was blocked.
```

**For Students**:
```
⚠️ WARNING: Sharing personal contact information (phone, email, social media) 
is strictly prohibited. Violations will result in immediate account suspension. 
You will not be allowed to attend classes even with available tokens. 
This message was blocked.
```

## Usage

### Allowed vs Blocked Examples

✅ **ALLOWED**:
```
"Check out this tutorial on tunect.com/resources"
"Let's discuss Chapter 3 tomorrow"
"Can you help me with algebra?"
"Visit localhost:3000 for the demo"
```

❌ **BLOCKED**:
```
"Call me at 9876543210"
"My email is tutor@gmail.com"
"Message me on WhatsApp"
"Find me on Instagram @tutorname"
"Visit my website: tutorsite.com"
"Reach me at tutor at gmail dot com" (obfuscation)
"My number is nine eight seven six five..." (spelled out)
```

## Architecture

### Files

1. **backend/src/common/pii-guard.service.ts**
   - Core detection logic
   - Pattern matching
   - Domain allowlist
   - Warning message generation

2. **backend/prisma/schema.prisma**
   - `PiiViolationLog` model for audit trail

3. **backend/src/common/common.module.ts**
   - Exports PiiGuardService globally

4. **backend/src/messages/enhanced-messages.service.ts**
   - Integrates PII check in `postMessage()`
   - Logs violations
   - Throws ForbiddenException with warning

### Flow

```
User sends message
    ↓
Backend receives POST /chat/conversations/:id/messages
    ↓
enhanced-messages.service.ts → postMessage()
    ↓
PiiGuardService.detectPii(content)
    ↓
IF violations found:
    → Log to PiiViolationLog
    → Throw ForbiddenException with role-specific warning
    → Message blocked (not saved, not broadcast)
    ↓
    Frontend shows alert with warning
    
IF clean:
    → Save message to database
    → Broadcast via WebSocket
    → User sees message
```

## Cost

**$0** - This system uses **zero external API calls**. All detection is done via regex patterns running locally in the Node.js process. No OpenAI, no GPT, no AI APIs.

## Future Enhancements (Optional)

### 1. Auto-Suspension After Multiple Violations
```typescript
// In enhanced-messages.service.ts
const violationCount = await this.prisma.piiViolationLog.count({
  where: { userId, createdAt: { gte: last30Days } }
});

if (violationCount >= 3) {
  await this.prisma.user.update({
    where: { id: userId },
    data: { status: 'SUSPENDED' }
  });
}
```

### 2. Admin Dashboard
- View all violations
- Filter by user, date, violation type
- Manual review and suspension controls

### 3. Google Meet Call Monitoring (Complex)
- Post-call transcription
- PII detection in transcripts
- Warning/suspension for call violations
- **Note**: Real-time blocking in calls is not feasible without custom infrastructure

## Testing

### Manual Testing

1. Try sending a message with phone: `"Call me at 9876543210"`
   - Should be blocked with warning

2. Try sending a message with email: `"Email me at test@gmail.com"`
   - Should be blocked with warning

3. Try sending a message with social media: `"Find me on Instagram @username"`
   - Should be blocked with warning

4. Try sending a message with allowed domain: `"Check tunect.com for updates"`
   - Should be allowed

5. Try obfuscation: `"My email is john at gmail dot com"`
   - Should be blocked (obfuscation detection)

### Check Violation Logs

```sql
SELECT * FROM "PiiViolationLog" ORDER BY "createdAt" DESC LIMIT 10;
```

## Maintenance

### Adding New Patterns

Edit `backend/src/common/pii-guard.service.ts`:

```typescript
private readonly socialPatterns = [
  // Add new pattern here
  /\b(tiktok|linkedin)\s*:?\s*[^\s]+/gi,
];
```

### Adding Allowed Domains

```typescript
private readonly allowedDomains = [
  'tunect.com', 
  'localhost', 
  'tunect.in',
  'yourdomain.com', // Add here
];
```

## Security Notes

- **Backend enforcement only** - Client checks are UX helpers only
- **Regex can be bypassed** - Very creative obfuscation might slip through (e.g., images, coded language)
- **AI fallback option** - If needed, can add GPT-4o-mini for $0.00015/1K tokens to catch sophisticated attempts
- **Audit trail** - All violation attempts are logged for review

## Questions?

- Detection not working? Check pattern regex in `pii-guard.service.ts`
- False positives? Adjust patterns or add to allowlist
- Need AI detection? Add OpenAI integration (will incur costs)
