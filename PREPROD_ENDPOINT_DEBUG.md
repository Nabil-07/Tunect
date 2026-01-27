# Preprod Endpoint Debugging Guide

## Issue Summary
Two endpoints are failing in preprod but working locally:
1. `/tutors/search` - Returns 500 Internal Server Error
2. `/tutors/recommended` - Returns 404 Not Found

## Root Causes Identified

### 1. `/tutors/search` - 500 Error
**Fixed Issues:**
- Null safety bug: `tutor.bio?.toLowerCase().includes()` was calling `.includes()` on `undefined`
- Missing error handling around Prisma queries
- Enhanced subject matching to handle spaces and URL encoding

**Files Changed:**
- `backend/src/tutors/tutors.service.ts` (lines ~640, ~559-572, ~489-502)
- `backend/src/tutors/tutors.controller.ts` (lines ~110-147)

### 2. `/tutors/recommended` - 404 Error
**Potential Causes:**
- Route not being registered properly in preprod
- JWT authentication guard failing before route handler
- Code not deployed to preprod yet

**Files Changed:**
- `backend/src/tutors/tutors.controller.ts` (lines ~56-108)
- `backend/src/tutors/tutors.service.ts` (lines ~286-458)
- `backend/src/auth/jwt-auth.guard.ts` (enhanced logging)

## Diagnostic Steps

### Step 1: Verify Code Deployment
```bash
# Check if latest code is deployed
cd backend
git log --oneline -5
npm run build
```

### Step 2: Test Route Registration
```bash
# Test health check endpoint (no auth required)
curl 'https://api-preprod.tunectnow.com/tutors/recommended/health'

# Should return: {"status":"ok","message":"Recommended endpoint is registered",...}
```

### Step 3: Check Server Logs
Look for these log messages in preprod:
- `[TutorsController.recommended] Processing request:`
- `[JwtAuthGuard] Unauthorized:`
- `[getRecommendedForStudent] Error:`

### Step 4: Verify JWT Token
```bash
# Decode JWT token to check payload
# Use jwt.io or:
echo "YOUR_JWT_TOKEN" | cut -d. -f2 | base64 -d | jq
```

Check:
- `sub` (user ID) exists
- `email` is in preprod allowlist (if enabled)
- Token is not expired
- `JWT_SECRET` matches between local and preprod

### Step 5: Test with curl
```bash
# Test recommended endpoint
curl 'https://api-preprod.tunectnow.com/tutors/recommended?pageSize=6' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Accept: application/json' \
  -v

# Check response:
# - 401 = Auth issue (check JWT_SECRET, token validity)
# - 404 = Route not found (check deployment, route registration)
# - 500 = Server error (check logs for details)
```

## Environment Differences to Check

### 1. JWT Configuration
**Local:** Check `.env` file
**Preprod:** Check `.env.preprod` or deployment environment variables

Verify:
- `JWT_SECRET` matches (or tokens are signed with same secret)
- `JWT_ISS` and `JWT_AUD` match token claims
- `APP_ENV=preprod` is set correctly

### 2. Database Connection
**Both use same database**, but verify:
- `DATABASE_URL` is correct in preprod
- Connection pool limits
- Network/firewall rules allow connection

### 3. Preprod Allowlist
If `PreprodInternalGuard` is enabled, check:
- User email is in `INTERNAL_TESTER_EMAILS` env var
- `isPreprodAllowedEmail()` function allows the user

### 4. Route Registration Order
Routes are registered in this order (should be fine):
1. `@Get()` - list
2. `@Get('recommended')` - recommended ✅
3. `@Get('search')` - search ✅
4. `@Get('trending')` - trending
5. `@Get('filters/options')` - filters
6. `@Get('me/sessions')` - me/sessions
7. `@Get('me')` - me
8. `@Get(':idOrTid')` - catch-all (comes last ✅)

## Fixes Applied

### Code Changes
1. ✅ Fixed null safety in text search (`bio` field)
2. ✅ Added comprehensive error handling
3. ✅ Enhanced logging for debugging
4. ✅ Made endpoints return empty lists instead of throwing errors
5. ✅ Improved JWT guard error logging
6. ✅ Added health check endpoint

### Deployment Checklist
- [ ] Build backend: `npm run build`
- [ ] Deploy to preprod
- [ ] Restart backend server
- [ ] Verify environment variables are set
- [ ] Check server logs for errors
- [ ] Test endpoints with curl

## Expected Behavior After Fix

### `/tutors/search`
- Should return 200 with tutor list OR empty list
- Should NOT return 500
- Errors logged to console with details

### `/tutors/recommended`
- Should return 200 with recommendations OR empty list
- Should NOT return 404
- If auth fails, should return 401 (not 404)
- Errors logged to console with details

## If Still Failing

1. **Check server logs** - New logging will show exact error
2. **Verify deployment** - Ensure latest code is deployed
3. **Test health endpoint** - `/tutors/recommended/health` should work
4. **Check JWT token** - Verify token is valid and user exists in DB
5. **Compare environments** - Ensure JWT_SECRET and other vars match

## Quick Test Commands

```bash
# 1. Health check (no auth)
curl 'https://api-preprod.tunectnow.com/tutors/recommended/health'

# 2. Search endpoint (no auth)
curl 'https://api-preprod.tunectnow.com/tutors/search?subject=Applied+Mathematics&page=1'

# 3. Recommended endpoint (requires auth)
curl 'https://api-preprod.tunectnow.com/tutors/recommended?pageSize=6' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```
