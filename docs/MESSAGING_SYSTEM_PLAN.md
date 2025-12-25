# Messaging System Implementation Plan

## 📋 Overview

This document outlines the implementation of a comprehensive messaging system with:
1. **1-on-1 Student-Tutor Messaging** (token-gated)
2. **Group Session Chats** (tutor broadcasts only)
3. **Admin Broadcast Groups** (subject-wise)

---

## 🗄️ Database Schema Updates

### 1. Enhanced Conversation Model

```prisma
model Conversation {
  id           String           @id @default(cuid())
  type         ConversationType @default(ONE_ON_ONE)
  
  // For ONE_ON_ONE
  studentId    String?
  tutorId      String?
  bookingId    String?
  
  // For GROUP_SESSION and ADMIN_BROADCAST
  name         String?
  description  String?
  createdById  String?          // Admin who created the group
  
  // Metadata
  isActive     Boolean          @default(true)
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  lastMessageAt DateTime?

  // Relations
  booking      Booking?         @relation("BookingToConversation", fields: [bookingId], references: [id], onDelete: SetNull)
  student      Student?         @relation("StudentConversations", fields: [studentId], references: [id], onDelete: Cascade)
  tutor        Tutor?           @relation("TutorConversations", fields: [tutorId], references: [id], onDelete: Cascade)
  createdBy    User?            @relation("UserToConversations", fields: [createdById], references: [id])
  
  messages     Message[]
  members      ConversationMember[]
  groupSession GroupBooking?    @relation("GroupSessionToConversation")

  @@unique([studentId, tutorId, bookingId])
  @@index([type, isActive])
  @@index([studentId, tutorId, createdAt])
  @@index([lastMessageAt])
}

enum ConversationType {
  ONE_ON_ONE        // Student ↔ Tutor (token-gated)
  GROUP_SESSION     // Group class chat (tutor-only posting)
  ADMIN_BROADCAST   // Admin → Teachers (subject-wise)
}
```

### 2. Conversation Members (for Groups)

```prisma
model ConversationMember {
  id             String       @id @default(cuid())
  conversationId String
  userId         String
  role           MemberRole   @default(MEMBER)
  canPost        Boolean      @default(true)
  canDelete      Boolean      @default(false)
  joinedAt       DateTime     @default(now())
  lastReadAt     DateTime?

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User         @relation("UserToConversationMembers", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@index([userId, conversationId])
}

enum MemberRole {
  ADMIN          // Can delete messages, add members
  MODERATOR      // Can post and manage content
  MEMBER         // Regular member
  READ_ONLY      // Can only view
}
```

### 3. Enhanced Message Model

```prisma
model Message {
  id             String    @id @default(cuid())
  conversationId String
  senderId       String
  text           String    @db.VarChar(2000)
  isDeleted      Boolean   @default(false)
  deletedById    String?
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User         @relation("UserToMessages", fields: [senderId], references: [id], onDelete: Cascade)
  deletedBy      User?        @relation("UserToDeletedMessages", fields: [deletedById], references: [id])
  attachments    MessageAttachment[]

  @@index([conversationId, createdAt])
  @@index([senderId, createdAt])
  @@index([isDeleted])
}
```

### 4. Link GroupBooking to Conversation

```prisma
model GroupBooking {
  // ... existing fields ...
  conversationId String?  @unique
  
  // ... existing relations ...
  conversation   Conversation? @relation("GroupSessionToConversation", fields: [conversationId], references: [id])
}
```

---

## 🏗️ Backend Implementation

### Phase 1: Database Migration

```bash
# Create migration file
npx prisma migrate dev --name add_group_messaging_system
```

### Phase 2: Service Updates

#### A. Enhanced Messages Service

```typescript
// src/messages/messages.service.ts

@Injectable()
export class MessagesService {
  
  // ✅ Existing: Get/Create 1-on-1 conversation
  async getOrCreateConversation(studentId: string, tutorId: string) { ... }
  
  // 🆕 NEW: Check if student has active tokens for tutor
  async canStudentMessageTutor(studentId: string, tutorId: string): Promise<boolean> {
    const balance = await this.prisma.tutorTokenBalance.findUnique({
      where: {
        studentId_tutorId: { studentId, tutorId },
      },
    });
    return balance && balance.balance > 0;
  }
  
  // 🆕 NEW: Send message with permission check
  async sendMessage(dto: SendMessageDto, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
      include: { student: true, tutor: true },
    });
    
    // Permission checks based on conversation type
    if (conversation.type === 'ONE_ON_ONE') {
      // Check token balance
      const canMessage = await this.canStudentMessageTutor(
        conversation.studentId,
        conversation.tutorId
      );
      if (!canMessage && conversation.student.userId === userId) {
        throw new ForbiddenException('No active tokens for this tutor');
      }
    }
    
    if (conversation.type === 'GROUP_SESSION') {
      // Only tutor can post
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: dto.conversationId,
            userId,
          },
        },
      });
      
      if (!member?.canPost) {
        throw new ForbiddenException('Only tutor can post in group session chats');
      }
    }
    
    // Create message
    return this.prisma.message.create({
      data: {
        conversationId: dto.conversationId,
        senderId: userId,
        text: dto.text,
      },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }
  
  // 🆕 NEW: Delete message (admin only)
  async deleteMessage(messageId: string, userId: string, role: Role) {
    if (role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can delete messages');
    }
    
    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedById: userId,
        deletedAt: new Date(),
      },
    });
  }
}
```

#### B. Group Management Service (NEW)

```typescript
// src/groups/groups.service.ts

@Injectable()
export class GroupsService {
  constructor(private prisma: PrismaService) {}
  
  // Auto-create group for group session
  async createGroupSessionChat(groupBookingId: string) {
    const groupBooking = await this.prisma.groupBooking.findUnique({
      where: { id: groupBookingId },
      include: {
        tutor: { include: { user: true } },
        participants: { include: { student: { include: { user: true } } } },
      },
    });
    
    const conversation = await this.prisma.conversation.create({
      data: {
        type: 'GROUP_SESSION',
        name: `Group Session: ${groupBooking.topic || 'Class'}`,
        description: `Group session on ${new Date(groupBooking.startTime).toLocaleString()}`,
        createdById: groupBooking.tutor.userId,
        isActive: true,
      },
    });
    
    // Add tutor as moderator (can post)
    await this.prisma.conversationMember.create({
      data: {
        conversationId: conversation.id,
        userId: groupBooking.tutor.userId,
        role: 'MODERATOR',
        canPost: true,
        canDelete: false,
      },
    });
    
    // Add students as read-only members
    await Promise.all(
      groupBooking.participants.map(p =>
        this.prisma.conversationMember.create({
          data: {
            conversationId: conversation.id,
            userId: p.student.userId,
            role: 'READ_ONLY',
            canPost: false,
            canDelete: false,
          },
        })
      )
    );
    
    // Link conversation to group booking
    await this.prisma.groupBooking.update({
      where: { id: groupBookingId },
      data: { conversationId: conversation.id },
    });
    
    return conversation;
  }
  
  // Admin creates subject-wise broadcast group
  async createAdminBroadcastGroup(dto: CreateBroadcastGroupDto, adminId: string) {
    const conversation = await this.prisma.conversation.create({
      data: {
        type: 'ADMIN_BROADCAST',
        name: dto.name,
        description: dto.description,
        createdById: adminId,
        isActive: true,
      },
    });
    
    // Add admin as admin role
    await this.prisma.conversationMember.create({
      data: {
        conversationId: conversation.id,
        userId: adminId,
        role: 'ADMIN',
        canPost: true,
        canDelete: true,
      },
    });
    
    // Add tutors as members
    if (dto.tutorIds?.length) {
      await Promise.all(
        dto.tutorIds.map(tutorId =>
          this.prisma.tutor.findUnique({ where: { id: tutorId } })
            .then(tutor =>
              this.prisma.conversationMember.create({
                data: {
                  conversationId: conversation.id,
                  userId: tutor.userId,
                  role: 'MEMBER',
                  canPost: false, // Only view
                  canDelete: false,
                },
              })
            )
        )
      );
    }
    
    return conversation;
  }
  
  // Add member to group (admin only)
  async addMemberToGroup(conversationId: string, userId: string, adminId: string) {
    // Verify admin permission
    const adminMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: adminId },
      },
    });
    
    if (adminMember?.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can add members');
    }
    
    // Add new member
    return this.prisma.conversationMember.create({
      data: {
        conversationId,
        userId,
        role: 'MEMBER',
        canPost: false,
        canDelete: false,
      },
    });
  }
}
```

---

## 🎨 Frontend Implementation

### Phase 1: Update Chat Component

```typescript
// Frontend/src/components/chat/ChatWindow.tsx

interface ChatWindowProps {
  conversation: {
    id: string;
    type: 'ONE_ON_ONE' | 'GROUP_SESSION' | 'ADMIN_BROADCAST';
    name?: string;
  };
  currentUser: User;
}

export function ChatWindow({ conversation, currentUser }: ChatWindowProps) {
  const [canPost, setCanPost] = useState(false);
  const [tokenWarning, setTokenWarning] = useState(false);
  
  useEffect(() => {
    // Check permissions
    if (conversation.type === 'ONE_ON_ONE') {
      // Check token balance
      checkTokenBalance();
    } else if (conversation.type === 'GROUP_SESSION') {
      // Check if user is tutor
      setCanPost(currentUser.role === 'TUTOR');
    } else {
      // Admin broadcast - check role
      setCanPost(currentUser.role === 'ADMIN');
    }
  }, [conversation]);
  
  return (
    <div className="flex flex-col h-full">
      {/* Header with group info */}
      <ChatHeader conversation={conversation} />
      
      {/* Token warning banner */}
      {tokenWarning && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
          <p className="text-sm text-amber-700">
            ⚠️ Your token balance is low. Purchase more tokens to continue messaging.
          </p>
        </div>
      )}
      
      {/* Messages */}
      <MessageList conversationId={conversation.id} />
      
      {/* Input (conditional) */}
      {canPost ? (
        <MessageInput conversationId={conversation.id} />
      ) : (
        <div className="border-t bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
          {conversation.type === 'GROUP_SESSION' 
            ? '👀 Read-only chat. Only tutor can post messages.'
            : '📢 Read-only broadcast group.'}
        </div>
      )}
    </div>
  );
}
```

### Phase 2: Admin Group Management UI

```typescript
// Frontend/src/pages/admin/broadcast-groups.tsx

export function AdminBroadcastGroups() {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">📢 Broadcast Groups</h2>
        <button onClick={() => setShowCreateModal(true)}>
          Create Group
        </button>
      </div>
      
      {/* Group list */}
      <div className="grid grid-cols-3 gap-4">
        {groups.map(group => (
          <GroupCard 
            key={group.id} 
            group={group}
            onClick={() => setSelectedGroup(group)}
          />
        ))}
      </div>
      
      {/* Create modal */}
      <CreateBroadcastGroupModal 
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
```

---

## ✅ Implementation Checklist

### Prerequisites
- [x] Existing Message/Conversation models
- [x] GroupBooking model
- [x] Token balance system
- [x] Role-based authentication

### Phase 1: Schema & Migration (Week 1)
- [ ] Add ConversationType enum
- [ ] Update Conversation model
- [ ] Create ConversationMember model
- [ ] Update Message model (soft delete)
- [ ] Add conversationId to GroupBooking
- [ ] Create and run migration

### Phase 2: Backend Services (Week 2)
- [ ] Update MessagesService
  - [ ] Token-gated messaging check
  - [ ] Permission-based send
  - [ ] Admin-only delete
- [ ] Create GroupsService
  - [ ] Auto-create group session chats
  - [ ] Admin broadcast group creation
  - [ ] Member management
- [ ] Create GroupsController
  - [ ] POST /groups/broadcast (admin)
  - [ ] POST /groups/:id/members (admin)
  - [ ] GET /groups (filtered by user)

### Phase 3: Auto-Triggers (Week 2)
- [ ] Hook into GroupBooking creation
  - [ ] Auto-create conversation
  - [ ] Add tutor as moderator
  - [ ] Add students as read-only
- [ ] Hook into token depletion
  - [ ] Disable messaging when balance = 0
  - [ ] Show warning at balance < 5

### Phase 4: Frontend (Week 3)
- [ ] Update ChatWindow component
  - [ ] Support 3 conversation types
  - [ ] Conditional input (canPost)
  - [ ] Token balance warning
  - [ ] Read-only indicator
- [ ] Create AdminBroadcastGroups page
  - [ ] Create group modal
  - [ ] Subject selection
  - [ ] Tutor selection (multi-select)
  - [ ] Member management
- [ ] Update ChatList component
  - [ ] Group icons/badges
  - [ ] Last message preview
  - [ ] Unread counts

### Phase 5: Audit & Security (Week 4)
- [ ] Message audit log
- [ ] Rate limiting on sends
- [ ] Content filtering (profanity)
- [ ] Admin dashboard for monitoring
- [ ] Export conversation history

---

## 🔒 Security & Privacy

### Token-Gated Messaging
```typescript
// Middleware to check token balance before allowing send
async function checkTokenBalance(studentId: string, tutorId: string) {
  const balance = await getTutorTokenBalance(studentId, tutorId);
  if (balance <= 0) {
    throw new ForbiddenException('No active tokens. Purchase tokens to message this tutor.');
  }
}
```

### No Message Encryption
- All messages stored in plaintext
- Admin can view/audit all conversations
- Trackable for compliance/safety

### Delete Permissions
```typescript
// Only admins can delete
if (user.role !== Role.ADMIN) {
  throw new ForbiddenException();
}

// Soft delete (preserve audit trail)
await prisma.message.update({
  where: { id },
  data: { 
    isDeleted: true, 
    deletedById: userId,
    deletedAt: new Date()
  }
});
```

### Privacy in Groups
- Only show name (no email, phone, etc.)
- Student profiles hidden from each other
- Only tutor/admin see full roster

---

## 📊 Analytics & Monitoring

### Metrics to Track
1. **Messages per conversation type**
2. **Token-blocked message attempts**
3. **Admin deletions (with reason)**
4. **Active group sessions**
5. **Broadcast group engagement rates**

### Admin Dashboard Queries
```sql
-- Most active conversations
SELECT c.id, c.type, COUNT(m.id) as message_count
FROM "Conversation" c
LEFT JOIN "Message" m ON m."conversationId" = c.id
WHERE m."isDeleted" = false
GROUP BY c.id
ORDER BY message_count DESC;

-- Students blocked by tokens
SELECT COUNT(*) 
FROM failed_message_attempts
WHERE reason = 'NO_TOKENS';
```

---

## 🚀 Deployment Steps

1. **Backup database**
   ```bash
   pg_dump tunect_prod > backup_$(date +%Y%m%d).sql
   ```

2. **Run migration**
   ```bash
   npx prisma migrate deploy
   ```

3. **Deploy backend**
   ```bash
   npm run build
   pm2 restart tunect-backend
   ```

4. **Deploy frontend**
   ```bash
   npm run build
   # Upload to CDN/hosting
   ```

5. **Test scenarios**
   - Student with tokens → can message
   - Student without tokens → blocked
   - Group session → tutor posts, students view
   - Admin broadcast → only admin posts
   - Admin deletes message → soft delete works

---

## 🎯 Success Criteria

- ✅ Students can only message tutors with active tokens
- ✅ Messaging disabled when tokens depleted
- ✅ Group session chats auto-created
- ✅ Only tutors can post in group sessions
- ✅ Admin broadcast groups working
- ✅ Only admins can delete messages
- ✅ Only admins can add members to groups
- ✅ Messages are trackable (no encryption)
- ✅ Only names visible in groups (privacy)
- ✅ No user can delete their own messages

---

## 📝 Next Steps

1. **Review this plan** with stakeholders
2. **Estimate effort** for each phase
3. **Create Jira tickets** for each checklist item
4. **Assign developers** to phases
5. **Set up staging environment** for testing
6. **Schedule sprint planning** meeting

**Estimated Timeline:** 4 weeks (1 developer full-time)

---

**Questions? Concerns? Let's discuss! 🎉**
