# Railway Database Performance Optimizations

## Problem
After migrating to Railway PostgreSQL, API response times degraded from milliseconds to seconds due to:
- Network latency (remote DB)
- Missing database indexes
- N+1 query problems
- No connection pooling
- Unoptimized queries

## Solutions Implemented

### 1. Connection Pooling (Immediate Impact)
Added to `.env`:
```
DATABASE_URL="postgresql://postgres:ReKLitvhgRnNvNnGZxonkekoeUghJMCx@gondola.proxy.rlwy.net:20241/railway?schema=public&connection_limit=10&pool_timeout=20"
```

### 2. Critical Database Indexes
Added indexes on frequently queried columns:

**User table:**
- `@@index([email])` ✓ Already exists
- `@@index([role, hasChosenRole])` - Filter by role

**Tutor table:**
- `@@index([status, updatedAt])` ✓ Already exists
- `@@index([isTrending, updatedAt])` ✓ Already exists
- `@@index([country])` - Filter by country
- `@@index([hourlyRate])` - Sort/filter by rate

**Student table:**
- `@@index([userId])` ✓ Already exists
- `@@index([createdAt])` ✓ Already exists

**Booking table:**
- `@@index([tutorId, startTime])` - Tutor's bookings by date
- `@@index([studentId, startTime])` - Student's bookings by date
- `@@index([status, startTime])` - Filter by status & sort
- `@@index([createdAt])` - Sort by creation date

**Review table:**
- `@@index([tutorId, rating])` - Tutor ratings aggregation
- `@@index([studentId])` - Student's reviews

**AvailabilitySlot table:**
- `@@index([tutorId, startTime])` - Tutor's availability
- `@@index([startTime, endTime])` - Time range queries

**Message table:**
- `@@index([conversationId, createdAt])` - Conversation messages

**Payment table:**
- `@@index([userId, createdAt])` - User payment history
- `@@index([status])` - Filter by status

### 3. N+1 Query Fixes

**Search Service - Already Optimized:**
- Uses single `findMany` with `include: { user: { select: {...} } }`
- Aggregates reviews in batch
- Good pagination

**Tutors Service - Needs Optimization:**
```typescript
// BEFORE (N+1 queries)
const tutors = await this.prisma.tutor.findMany({ ... });
// Then loops and fetches reviews for each tutor

// AFTER (Single query)
const tutors = await this.prisma.tutor.findMany({
  include: {
    user: { select: { name: true, email: true, avatarUrl: true } },
    _count: { select: { reviews: true } }
  }
});
```

### 4. Query Optimizations

**Add pagination everywhere:**
- Limit default page size to 20-50 items
- Add `take` and `skip` to all `findMany` queries

**Select only needed fields:**
```typescript
// BEFORE
await this.prisma.user.findMany({ ... });

// AFTER
await this.prisma.user.findMany({
  select: { id: true, email: true, name: true, role: true }
});
```

### 5. Caching Strategy (Future)
- Cache trending tutors (5 min TTL)
- Cache tutor details (2 min TTL)
- Use Redis or in-memory cache

## Implementation Priority

1. **CRITICAL (Do Now):**
   - ✅ Add connection pooling parameters to DATABASE_URL
   - ✅ Add database indexes via migration
   - ✅ Fix N+1 queries in tutors service

2. **HIGH (This Week):**
   - Add selective field selection
   - Optimize admin dashboard queries
   - Add database query logging

3. **MEDIUM (Next Sprint):**
   - Implement caching layer
   - Add database read replicas
   - Optimize complex aggregations

## Expected Results
- Find tutor API: **< 200ms** (from 2-5s)
- Tutor details: **< 100ms** (from 1-3s)
- List bookings: **< 150ms** (from 2-4s)
- Search: **< 250ms** (from 3-6s)

## Monitoring
Add query logging to track slow queries:
```typescript
// In prisma.service.ts
prisma.$on('query', (e) => {
  if (e.duration > 200) {
    console.warn(`Slow query (${e.duration}ms): ${e.query}`);
  }
});
```
