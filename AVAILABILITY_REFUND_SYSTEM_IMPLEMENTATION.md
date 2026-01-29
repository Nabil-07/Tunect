# Availability Tracking & Refund System - Implementation Guide

## 📋 Overview

Complete implementation of tutor availability tracking, automated alerts, token transfer/refund system, and enhanced admin features.

## 🗄️ Database Schema Changes

### New Tables

1. **TokenTransferRequest** - Student requests to transfer tokens between tutors
2. **RefundRequest** - Student requests for refunds (7-day policy)
3. **TutorAvailabilityAlert** - Tracks alerts sent to students/tutors

### Enhanced Tables

1. **Tutor** - Added fields:
   - `lastActiveDate` - Last time tutor posted availability
   - `availabilityConsistency` - Percentage of days with slots (0-100)
   - `isFeatured` - Featured status (requires 10+ hours/week)
   - `isVerified` - Verified status (requires 10+ hours/week + 70% consistency)
   - `weeklyAvailabilityHours` - Hours posted in last 7 days
   - `lastAvailabilityUpdate` - Last metrics update timestamp

2. **AuditLog** - Added fields:
   - `endpoint` - API endpoint where action occurred
   - `ipAddress` - IP address of admin making the change

## 🔧 Backend Implementation

### Services Created

1. **AvailabilityTrackingService** (`backend/src/availability/availability-tracking.service.ts`)
   - `updateTutorAvailabilityMetrics()` - Calculate and update tutor metrics
   - `checkInactiveTutorsAndAlert()` - Find tutors inactive 14+ days and alert students
   - `checkPendingTokensAndWarn()` - Warn tutors with pending tokens (48-hour rule)
   - `getTutorAvailabilityInfo()` - Get availability info for profile display

2. **RefundsService** (`backend/src/refunds/refunds.service.ts`)
   - `createTokenTransferRequest()` - Student requests token transfer
   - `processTokenTransferRequest()` - Admin approves/rejects transfer
   - `createRefundRequest()` - Student requests 7-day refund
   - `processRefundRequest()` - Admin approves/rejects refund
   - `getPendingTransferRequests()` - List pending transfers (admin)
   - `getPendingRefundRequests()` - List pending refunds (admin)

### Scheduled Tasks

Added to `backend/src/tasks/tasks.service.ts`:
- **Daily at 03:00 UTC**: Check inactive tutors (14+ days) and send alerts
- **Every 6 hours**: Check pending tokens and send 48-hour warnings
- **Daily at 04:00 UTC**: Update all tutor availability metrics

### API Endpoints

#### Refunds & Transfers
```
POST   /refunds/transfer              - Request token transfer (student)
POST   /refunds/request               - Request refund (student)
POST   /refunds/transfer/:id/process  - Process transfer (admin)
POST   /refunds/request/:id/process   - Process refund (admin)
GET    /refunds/transfer/pending      - List pending transfers (admin)
GET    /refunds/request/pending       - List pending refunds (admin)
```

#### Admin Student Management
```
GET    /admin/students                - List all students
GET    /admin/students/:id            - Get student detail with full history
GET    /admin/audit                   - List admin audit logs (enhanced)
```

### Modules Created

1. **RefundsModule** (`backend/src/refunds/refunds.module.ts`)
2. **AvailabilityTrackingService** added to AvailabilityModule

## 🎨 Frontend Implementation

### Pages to Create/Update

1. **Admin Student Detail Page** (`Frontend/src/pages/admin/student-detail.tsx`)
   - Student information
   - Token balances (by tutor)
   - Booking history
   - Class history
   - Transfer/refund requests
   - Transaction history

2. **Admin Students List** (`Frontend/src/pages/admin/students.tsx`)
   - Make student names hyperlinked to detail page
   - Show token balance
   - Show account status

3. **Support Section** (`Frontend/src/pages/support.tsx` or similar)
   - Add "Request Refund" button for eligible cases
   - Show refund request status

4. **Tutor Profile** (`Frontend/src/pages/tutor/[id].tsx`)
   - Display "Last Active" timestamp
   - Display "Availability Consistency" percentage
   - Show Featured/Verified badges

5. **Admin Audit Log Page** (`Frontend/src/pages/admin/audit.tsx`)
   - Show all admin actions
   - Filter by admin, action type, date range
   - Show endpoint and IP address

### Components to Create

1. **RefundRequestButton** - Button in support section
2. **TokenTransferRequestForm** - Form to request token transfer
3. **AdminRefundApprovalPanel** - Admin panel to approve/reject requests
4. **TutorAvailabilityBadge** - Display availability status on profile

## 📝 Key Features

### 1. Tutor Availability Tracking
- Tracks last active date
- Calculates weekly availability hours
- Calculates consistency percentage (days with slots / 14 days)
- Updates Featured/Verified status based on 10 hours/week requirement

### 2. Automated Alerts
- **14-Day Alert**: If tutor inactive 14+ days, alert students with tokens
- **48-Hour Warning**: Email tutor if students have tokens waiting and no slots posted

### 3. Token Transfer System
- Students can request to transfer tokens from Tutor A to Tutor B/C
- Admin reviews and approves/rejects
- Tokens are transferred atomically

### 4. Refund System
- **7-Day Policy**: If tutor hasn't posted slots within 7 days of purchase, student can request refund
- "No-Questions-Asked" refund button in support section
- Admin reviews and approves/rejects

### 5. Admin Enhancements
- **Student Detail Page**: Full history view with hyperlinked names
- **Audit Logging**: Tracks which admin, when, where (endpoint), and IP address
- **Request Management**: Admin can view and process all transfer/refund requests

## 🔄 Workflows

### Token Transfer Workflow
1. Student requests transfer via API
2. System validates tokens exist
3. Notification sent to admins
4. Admin reviews request
5. Admin approves/rejects
6. If approved: tokens transferred atomically
7. Student notified of result

### Refund Workflow
1. Student clicks "Request Refund" in support section
2. System validates:
   - 7 days have passed since purchase
   - Tutor hasn't posted slots in last 7 days
   - Student has tokens with tutor
3. Refund request created
4. Notification sent to admins
5. Admin reviews and approves/rejects
6. If approved: tokens refunded to student's general balance
7. Student notified

### Availability Alert Workflow
1. Scheduled task runs daily
2. Finds tutors inactive 14+ days
3. For each tutor with students having tokens:
   - Check if alert sent recently (within 7 days)
   - If not, send notification to student
   - Record alert in database

## 📊 Database Migration

Run the migration:
```bash
cd backend
npx prisma migrate dev --name availability_refund_system
```

Or apply the SQL directly:
```bash
psql $DATABASE_URL < backend/prisma/migrations/20260127_availability_refund_system/migration.sql
```

## 🚀 Deployment Steps

1. **Database Migration**
   ```bash
   cd backend
   npx prisma migrate dev --name availability_refund_system
   # Or for production:
   npx prisma migrate deploy
   npx prisma generate
   ```

2. **Update App Module**
   - ✅ `RefundsModule` added to imports
   - ✅ `TasksModule` includes `AvailabilityTrackingService`
   - ✅ `AvailabilityModule` exports `AvailabilityTrackingService`

3. **Build & Deploy**
   ```bash
   npm run build
   # Deploy to server
   ```

4. **Verify Scheduled Tasks**
   - Check logs for scheduled task execution
   - Verify metrics are being updated
   - Scheduled tasks run:
     - Daily at 03:00 UTC: Check inactive tutors (14+ days)
     - Every 6 hours: Check pending tokens (48-hour warnings)
     - Daily at 04:00 UTC: Update all tutor availability metrics

## 📋 Testing Checklist

- [ ] Tutor availability metrics update correctly
- [ ] Featured/Verified status updates based on 10 hours/week
- [ ] 14-day alerts sent to students
- [ ] 48-hour warnings sent to tutors
- [ ] Token transfer requests work end-to-end
- [ ] Refund requests work end-to-end
- [ ] Admin can view student detail page
- [ ] Admin audit log shows endpoint and IP
- [ ] Student names are hyperlinked in admin list
- [ ] Support section shows refund button when eligible

## 🔍 Monitoring

Monitor these metrics:
- Number of inactive tutors (14+ days)
- Number of pending token transfers
- Number of pending refunds
- Tutor availability consistency trends
- Admin action audit logs

## 📚 Related Files

### Backend
- `backend/src/availability/availability-tracking.service.ts`
- `backend/src/refunds/refunds.service.ts`
- `backend/src/refunds/refunds.controller.ts`
- `backend/src/refunds/refunds.module.ts`
- `backend/src/tasks/tasks.service.ts` (enhanced)
- `backend/src/audit/audit.service.ts` (enhanced)
- `backend/src/admin/admin.service.ts` (enhanced)

### Frontend
- `Frontend/src/pages/admin/student-detail.tsx` (new)
- `Frontend/src/pages/admin/students.tsx` (updated)
- `Frontend/src/pages/admin/audit.tsx` (new)
- `Frontend/src/pages/support.tsx` (updated)
- `Frontend/src/pages/tutor/[id].tsx` (updated)

### Database
- `backend/prisma/schema.prisma` (updated)
- `backend/prisma/migrations/20260127_availability_refund_system/migration.sql`
