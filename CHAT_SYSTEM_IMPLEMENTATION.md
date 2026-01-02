# In-App Chat System - Complete Implementation Guide

## 📋 Overview

Complete in-app chat system with token gating, strict permissions, and admin features.

### Conversation Types
1. **DIRECT** - 1:1 student ↔ tutor chat
2. **GROUP_SESSION** - Auto-created for group bookings
3. **ADMIN_BROADCAST** - Admin announcements (read-only for recipients)

### Core Features
- ✅ Text-only messages (max 2000 chars)
- ✅ Token gating (DIRECT & GROUP_SESSION)
- ✅ Admin soft-delete with audit logs
- ✅ Rate limiting (10 messages/minute)
- ✅ Auto-triggers on booking events
- ✅ Conversation export (admin only)
- ✅ Member management (broadcast only)

---

## 🗄️ Database Schema

### New Tables

#### Conversation
```prisma
model Conversation {
  id          String            @id @default(cuid())
  type        ConversationType  @default(DIRECT)
  referenceId String?          // bookingId for GROUP_SESSION
  isActive    Boolean           @default(true)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @default(now()) @updatedAt
  
  members     ConversationMember[]
  messages    Message[]
}
```

#### ConversationMember
```prisma
model ConversationMember {
  id             String                   @id @default(cuid())
  conversationId String
  userId         String
  role           ConversationMemberRole   @default(MEMBER)
  joinedAt       DateTime                 @default(now())
  leftAt         DateTime?
}
```

#### Message
```prisma
model Message {
  id             String   @id @default(cuid())
  conversationId String
  senderId       String
  content        String   @db.VarChar(2000)
  isDeleted      Boolean  @default(false)
  deletedBy      String?
  deletedAt      DateTime?
  createdAt      DateTime @default(now())
  
  auditLogs      MessageAuditLog[]
}
```

#### MessageAuditLog
```prisma
model MessageAuditLog {
  id          String              @id @default(cuid())
  messageId   String
  action      MessageAuditAction
  performedBy String
  performedAt DateTime            @default(now())
  metadata    String?            // JSON
}
```

### New Enums
```prisma
enum ConversationType {
  DIRECT
  GROUP_SESSION
  ADMIN_BROADCAST
}

enum ConversationMemberRole {
  ADMIN
  MEMBER
}

enum MessageAuditAction {
  CREATED
  DELETED
  RESTORED
}
```

---

## 🔧 Backend Implementation

### Services Created

1. **EnhancedMessagesService** (`backend/src/messages/enhanced-messages.service.ts`)
   - Post messages with token gating
   - Soft delete messages (admin)
   - Get conversation details
   - List conversations
   - Export conversation history

2. **ChatTriggersService** (`backend/src/messages/chat-triggers.service.ts`)
   - `onDirectBookingCreated()` - Create DIRECT conversation
   - `onGroupBookingCreated()` - Create/update GROUP_SESSION
   - `onGroupBookingCancelled()` - Remove student from group
   - `checkAndArchiveConversation()` - Archive when empty

### API Endpoints

#### Chat Operations
```
POST   /chat/conversations/:id/messages    Send message
GET    /chat/conversations/:id              Get conversation details
GET    /chat/conversations                  List all conversations
DELETE /chat/messages/:id                   Delete message (admin)
```

#### Admin Features
```
POST   /chat/broadcast                      Create broadcast group
POST   /chat/conversations/:id/members      Add members (admin)
DELETE /chat/conversations/:id/members      Remove members (admin)
GET    /chat/conversations/:id/export       Export conversation (admin)
```

### Permission Rules

| Action | DIRECT | GROUP_SESSION | ADMIN_BROADCAST |
|--------|--------|---------------|-----------------|
| Send message | Token required | Token required | Admin only |
| Read messages | Members only | Members only | Members only |
| Delete message | Admin only | Admin only | Admin only |
| Add/remove members | - | - | Admin only |

### Token Gating Logic
```typescript
// DIRECT & GROUP_SESSION require tokens
if (type === 'DIRECT' || type === 'GROUP_SESSION') {
  const balance = await checkTokenBalance(userId);
  if (balance <= 0) {
    throw ForbiddenException('Token balance exhausted');
  }
}

// ADMIN_BROADCAST: only admins can send
if (type === 'ADMIN_BROADCAST') {
  if (userRole !== 'ADMIN') {
    throw ForbiddenException('Read-only');
  }
}
```

---

## 🎨 Frontend Components

### Created Components

1. **ChatWindow** (`Frontend/src/components/chat/ChatWindow.tsx`)
   - Display messages
   - Send/receive messages
   - Token balance warnings
   - Admin delete button
   - Auto-scroll to bottom

2. **ChatList** (`Frontend/src/components/chat/ChatList.tsx`)
   - List all conversations
   - Show last message preview
   - Conversation type badges
   - Click to open chat

3. **chatService** (`Frontend/src/services/chatService.ts`)
   - API integration
   - TypeScript interfaces
   - All CRUD operations

### UI Features

#### Token Balance Warnings
```tsx
// Red warning: No tokens
<AlertTriangle /> Token balance exhausted. Cannot send messages.

// Yellow warning: Low tokens (< 5)
<AlertTriangle /> Low token balance: X tokens remaining.
```

#### Conversation Type Badges
- **DIRECT**: No badge
- **GROUP_SESSION**: Blue badge with member count
- **ADMIN_BROADCAST**: Purple "Broadcast (Read-only)" badge

#### Message Display
- Deleted messages show as: "Message removed by admin"
- Admin users see delete button (trash icon)
- Sender name shown for received messages
- Timestamps in local time

---

## 🔄 Auto-Triggers Integration

### In `bookings.service.ts`

```typescript
// Import
import { ChatTriggersService } from '../messages/chat-triggers.service';

// Constructor
constructor(
  private chatTriggers: ChatTriggersService,
) {}

// After creating DIRECT booking:
await this.chatTriggers.onDirectBookingCreated(
  booking.id,
  tutor.userId,
  student.userId,
);

// After creating GROUP booking:
await this.chatTriggers.onGroupBookingCreated(
  groupBooking.id,
  tutor.userId,
  student.userId,
);

// On booking cancellation:
await this.chatTriggers.onGroupBookingCancelled(
  booking.id,
  student.userId,
);
```

### In `bookings.module.ts`
```typescript
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    // ...
    MessagesModule,  // Add this
  ],
})
```

---

## 📝 Migration Steps

### 1. Run Database Migration
```bash
cd backend
npx prisma migrate dev --name chat_system
```

Or apply manually:
```bash
psql $DATABASE_URL -f prisma/migrations/20260102_chat_system/migration.sql
```

### 2. Generate Prisma Client
```bash
npx prisma generate
```

### 3. Update Bookings Module
Add `MessagesModule` to imports in `bookings.module.ts`

### 4. Inject ChatTriggersService
Add to bookings service constructor and call triggers

### 5. Add Frontend Routes
```tsx
// In App.tsx or router config
<Route path="/chat" element={<StudentChatPage />} />
<Route path="/chat/:conversationId" element={<StudentChatPage />} />
```

---

## 🧪 Testing Guide

### Manual Testing Checklist

#### DIRECT Conversations
- [ ] Create direct booking → conversation auto-created
- [ ] Send message with tokens → success
- [ ] Deplete tokens → input disabled
- [ ] Admin deletes message → shows "Message removed by admin"

#### GROUP_SESSION Conversations
- [ ] Create group booking → conversation created
- [ ] Second student joins → added to existing conversation
- [ ] Student cancels → removed from conversation (leftAt set)
- [ ] System message shown on join/leave

#### ADMIN_BROADCAST
- [ ] Admin creates broadcast → conversation created
- [ ] Admin sends message → success
- [ ] Non-admin tries to send → forbidden
- [ ] Members receive → can read
- [ ] Admin adds/removes members → success

#### Token Gating
- [ ] Student with 0 tokens → cannot send messages
- [ ] Warning shown when balance < 5
- [ ] Banner shows "Purchase tokens to continue"
- [ ] Messages still readable with 0 tokens

#### Permissions
- [ ] Non-member cannot access conversation
- [ ] Admin can view all conversations
- [ ] Only admin can delete messages
- [ ] Audit log created on deletion

#### Rate Limiting
- [ ] Send 10 messages rapidly → success
- [ ] 11th message within 1 minute → rate limit error
- [ ] Wait 1 minute → can send again

#### UI/UX
- [ ] Messages auto-scroll to bottom
- [ ] Timestamps formatted correctly
- [ ] Badges show correct conversation type
- [ ] Input disabled when canPost=false
- [ ] Delete button only visible to admin

---

## 📊 Admin Features

### Create Broadcast Group
```typescript
POST /chat/broadcast
{
  "name": "Weekly Updates",
  "memberIds": ["user1", "user2", "user3"],
  "initialMessage": "Welcome to weekly updates!"
}
```

### Add Members
```typescript
POST /chat/conversations/:id/members
{
  "userIds": ["user4", "user5"]
}
```

### Export Conversation
```typescript
GET /chat/conversations/:id/export

Response:
{
  "conversation": { ... },
  "messages": [ ... ],
  "exportedAt": "2026-01-02T...",
  "exportedBy": { id, email, name }
}
```

---

## 🔒 Security Considerations

### Implemented
- ✅ JWT authentication required
- ✅ Member-only access to conversations
- ✅ Admin role checks via `@Roles('ADMIN')` guard
- ✅ Token balance verification
- ✅ Rate limiting (10 msg/min)
- ✅ Soft delete preserves message history
- ✅ Audit logs for all deletions

### Recommended
- [ ] Add message content filtering (profanity/spam)
- [ ] Implement WebSocket for real-time updates
- [ ] Add file attachment support with S3 integration
- [ ] Add read receipts tracking
- [ ] Add typing indicators
- [ ] Add conversation search
- [ ] Add message reactions

---

## 🐛 Troubleshooting

### Issue: "Not a member of this conversation"
**Cause**: User not in ConversationMember table  
**Fix**: Check auto-trigger was called on booking creation

### Issue: "Token balance exhausted"
**Cause**: Student has 0 tokens  
**Fix**: Purchase tokens or admin adjustment

### Issue: Messages not showing
**Cause**: Frontend not polling/refreshing  
**Fix**: Implement WebSocket or periodic refresh

### Issue: Admin can't delete
**Cause**: User role not set to ADMIN  
**Fix**: Update user role in database

---

## 📦 File Structure

```
backend/
├── prisma/
│   ├── schema.prisma                          ✅ Updated
│   └── migrations/
│       └── 20260102_chat_system/
│           └── migration.sql                  ✅ Created
└── src/
    └── messages/
        ├── dto/
        │   ├── create-broadcast.dto.ts        ✅ Created
        │   └── manage-members.dto.ts          ✅ Created
        ├── messages.module.ts                 ✅ Updated
        ├── enhanced-messages.service.ts       ✅ Created
        ├── enhanced-messages.controller.ts    ✅ Created
        └── chat-triggers.service.ts           ✅ Created

Frontend/
└── src/
    ├── services/
    │   └── chatService.ts                     ✅ Created
    ├── components/
    │   └── chat/
    │       ├── ChatWindow.tsx                 ✅ Created
    │       └── ChatList.tsx                   ✅ Created
    └── pages/
        └── student/
            └── chat.tsx                       ⏳ Update needed
```

---

## ✅ Implementation Complete

All core features have been implemented. Next steps:

1. **Run migration** to update database schema
2. **Integrate triggers** in bookings service
3. **Add frontend routes** for chat pages
4. **Test all scenarios** from checklist above
5. **Deploy** to test environment

For questions or issues, refer to the integration guide: `backend/CHAT_INTEGRATION_GUIDE.md`
