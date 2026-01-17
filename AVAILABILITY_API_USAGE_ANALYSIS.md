# Availability API Endpoints Usage Analysis

## Endpoint Status Report

### ✅ **USED ENDPOINTS** (10/15)

#### 1. **GET /availability/me/slots** ✅
- **Used in**: `tutorService.ts` → `getAvailability()`, `getAvailabilityForMonth()`
- **Purpose**: Fetch tutor's own slots with optional date range filter
- **Status**: **Primary endpoint for fetching slots**

#### 2. **GET /availability/me** ✅
- **Used in**: `tutorService.ts` → `getAvailability()`, `getAvailabilityForMonth()` (fallback)
- **Purpose**: Fetch all tutor's slots without filters
- **Status**: **Fallback endpoint**

#### 3. **PATCH /availability/me** ✅
- **Used in**: `tutorService.ts` → `updateAvailability()`, `saveAvailabilityForMonth()`
- **Purpose**: Bulk update/replace slots
- **Status**: **Used for saving month's availability**

#### 4. **PUT /availability/me** ✅
- **Used in**: `tutorService.ts` → `updateAvailability()`, `saveAvailabilityForMonth()` (fallback)
- **Purpose**: Bulk update/replace slots (alternative to PATCH)
- **Status**: **Fallback endpoint**

#### 5. **PATCH /availability/me/slots** ✅
- **Used in**: `tutorService.ts` → `updateAvailability()`
- **Purpose**: Bulk update slots
- **Status**: **Primary update endpoint**

#### 6. **PUT /availability/me/slots** ✅
- **Used in**: `tutorService.ts` → `updateAvailability()` (fallback)
- **Purpose**: Bulk update slots (alternative to PATCH)
- **Status**: **Fallback endpoint**

#### 7. **POST /availability/slots** ✅
- **Used in**: `tutorService.ts` → `updateAvailability()` (final fallback)
- **Purpose**: Create/update slots
- **Status**: **Last resort fallback**

#### 8. **GET /availability/tutors/:tutorId/bookable** ✅
- **Used in**: `tutor/public-profile.tsx`, `student/checkout.tsx`
- **Purpose**: Get bookable time slots for a specific tutor
- **Status**: **Primary public endpoint**

#### 9. **GET /availability/tutor/:tutorId/bookable** ✅
- **Used in**: `tutor/public-profile.tsx`, `student/checkout.tsx` (fallback)
- **Purpose**: Get bookable time slots (singular form)
- **Status**: **Fallback for compatibility**

#### 10. **GET /availability/bookable/:tutorId** ✅
- **Used in**: `tutor/public-profile.tsx`, `student/checkout.tsx` (legacy fallback)
- **Purpose**: Legacy endpoint for bookable slots
- **Status**: **Legacy fallback**

---

### ❌ **UNUSED ENDPOINTS** (5/15)

#### 11. **POST /availability/me** ❌
- **Backend**: `createMine()` - Creates a single slot
- **Frontend**: **NOT USED**
- **Issue**: Frontend only uses bulk operations (`updateAvailability`, `saveAvailabilityForMonth`)
- **Recommendation**: **Keep for API completeness** or remove if single-slot creation isn't needed

#### 12. **GET /availability/me** ❌ (Without query params)
- **Backend**: `listMine()` - Returns all slots without filtering
- **Frontend**: Only used as fallback with query params in `getAvailability()`
- **Issue**: Direct calls without params are not used
- **Recommendation**: **Keep as fallback** - it's used in the fallback chain

#### 13. **PATCH /availability/me/:id** ❌
- **Backend**: `updateMine()` - Updates a single slot by ID
- **Frontend**: **NOT USED**
- **Issue**: Frontend doesn't update individual slots via API - it uses bulk operations
- **Recommendation**: **Consider removing** unless you plan to add individual slot editing

#### 14. **DELETE /availability/me/:id** ❌
- **Backend**: `deleteMine()` - Deletes a single slot by ID
- **Frontend**: **NOT USED**
- **Issue**: Frontend handles deletions locally and saves all slots via bulk update
- **Recommendation**: **Consider removing** unless you plan to add individual slot deletion via API

#### 15. **GET /availability/tutor/:tutorId** ❌
- **Backend**: `listByTutor()` - Returns all slots for a tutor (for approved tutors only)
- **Frontend**: **NOT USED**
- **Issue**: Frontend uses `/bookable` endpoints instead, which filter out booked slots
- **Recommendation**: **Consider removing** - `/bookable` endpoints are more useful

#### 16. **GET /availability/tutors/:tutorId** ❌ (Duplicate of #15)
- **Backend**: `listByTutorPlural()` - Same as above but plural path
- **Frontend**: **NOT USED**
- **Issue**: Same as #15
- **Recommendation**: **Consider removing**

---

## Summary

### Usage Statistics:
- **Used**: 10/15 endpoints (67%)
- **Unused**: 5/15 endpoints (33%)

### Recommendations:

1. **Safe to Remove** (if individual slot operations aren't needed):
   - `POST /availability/me` (single slot creation)
   - `PATCH /availability/me/:id` (single slot update)
   - `DELETE /availability/me/:id` (single slot deletion)

2. **Keep for Compatibility** (but not critical):
   - `GET /availability/tutor/:tutorId` (plural form is used)
   - `GET /availability/tutors/:tutorId` (already have `/bookable` variants)

3. **Keep as Fallbacks**:
   - `GET /availability/me` (used in fallback chain)
   - Multiple PUT/PATCH/POST variants (used for backward compatibility)

### Current Architecture Pattern:
The frontend follows a **bulk operation pattern**:
- Fetch all slots for a month → Bulk save all slots
- Individual slot edits are done in-memory, then saved as a batch
- This reduces API calls and ensures consistency

If you want individual slot operations, you'd need to:
- Add API calls in `availability.tsx` for individual slot updates/deletes
- Use the unused endpoints (`PATCH /availability/me/:id`, `DELETE /availability/me/:id`)
