# PII Encryption Setup Guide

This guide explains how to set up field-level encryption for Personally Identifiable Information (PII) in API responses.

## Overview

The encryption system automatically encrypts sensitive fields (email, phone, etc.) in API responses so that:
- **Regular users** see encrypted data in network inspector
- **Company/Admin users** can decrypt and see plain data
- **Frontend** automatically decrypts data if encryption key is configured

## Architecture

1. **Backend Encryption Service** (`backend/src/common/services/encryption.service.ts`)
   - Uses AES-256-GCM encryption
   - Encrypts sensitive fields before sending response
   - Only encrypts for non-admin users

2. **Response Interceptor** (`backend/src/common/interceptors/encrypt-response.interceptor.ts`)
   - Automatically intercepts all API responses
   - Encrypts configured fields
   - Skips encryption for ADMIN users

3. **Frontend Decryption** (`Frontend/src/utils/decryption.ts`)
   - Automatically decrypts responses via Axios interceptor
   - Uses Web Crypto API (browser-native)
   - Only works if encryption key is configured

## Setup Instructions

### Step 1: Generate Encryption Key

Generate a secure 32-byte (256-bit) encryption key:

```bash
# Using OpenSSL
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using Python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Example output:**
```
K8j3mN9pQ2rT5vX8zA1bC4dE7fG0hI3jK6lM9nO2pQ5rS8tU1vW4xY7zA0b=
```

### Step 2: Configure Backend

Add the encryption key to your backend `.env` file:

```env
# Backend .env
ENCRYPTION_KEY=K8j3mN9pQ2rT5vX8zA1bC4dE7fG0hI3jK6lM9nO2pQ5rS8tU1vW4xY7zA0b=
```

**Important:** 
- Use the same key for all environments (dev, staging, production)
- Store this key securely (use secrets management in production)
- Never commit this key to version control

### Step 3: Configure Frontend

Add the encryption key to your frontend `.env` file:

```env
# Frontend .env
VITE_ENCRYPTION_KEY=K8j3mN9pQ2rT5vX8zA1bC4dE7fG0hI3jK6lM9nO2pQ5rS8tU1vW4xY7zA0b=
```

**Note:** Frontend key must match backend key exactly.

### Step 4: Configure Internal Testers (Optional)

If you want internal testers to see plain (unencrypted) data for easier testing, add their emails to your backend `.env` file:

```env
# Backend .env
INTERNAL_TESTER_EMAILS=testuser1@example.com,testuser2@example.com,developer@tunectnow.com
```

**Note:** 
- Internal testers will see plain data in API responses (no encryption)
- If `INTERNAL_TESTER_EMAILS` is not set, the system will fallback to `PREPROD_ALLOWED_EMAILS` (if configured)
- Separate multiple emails with commas
- Email matching is case-insensitive

### Step 5: Restart Services

```bash
# Backend
npm run start:dev

# Frontend
npm run dev
```

## How It Works

### Backend Flow

1. API endpoint returns data with sensitive fields (e.g., `email: "user@example.com"`)
2. `EncryptResponseInterceptor` intercepts the response
3. Checks user access level:
   - **ADMIN users**: Returns plain data (no encryption)
   - **Internal testers** (emails in `INTERNAL_TESTER_EMAILS` or `PREPROD_ALLOWED_EMAILS`): Returns plain data (no encryption)
   - **Regular users**: Encrypts sensitive fields
4. Returns encrypted response: `email: "aGVsbG8gd29ybGQ=..."` (for regular users)

### Frontend Flow

1. Axios receives encrypted response
2. `apiClient.ts` interceptor detects encrypted fields
3. Automatically decrypts using `VITE_ENCRYPTION_KEY`
4. Application receives plain data

### What Gets Encrypted

By default, these fields are encrypted:
- `email`
- `phone`
- `address`
- `user.email`
- `user.phone`
- `user.name` (optional)
- `tutor.user.email`
- `student.user.email`

You can customize this list in `encrypt-response.interceptor.ts`:

```typescript
private readonly encryptableFields = [
  'email',
  'phone',
  // Add more fields here
];
```

## Testing

### Test Encryption is Working

1. **Without encryption key:**
   - Inspect network tab → See encrypted values (base64 strings)
   - Frontend shows encrypted values

2. **With encryption key:**
   - Inspect network tab → Still see encrypted values
   - Frontend automatically decrypts → Shows plain values

3. **As ADMIN user:**
   - Inspect network tab → See plain values (no encryption)
   - Frontend shows plain values

4. **As Internal Tester:**
   - Inspect network tab → See plain values (no encryption)
   - Frontend shows plain values
   - No decryption needed (data is already plain)

### Manual Decryption (for debugging)

```typescript
import { decryptField } from '@/utils/decryption';

const encryptedEmail = 'aGVsbG8gd29ybGQ=...';
const plainEmail = await decryptField(encryptedEmail);
console.log(plainEmail); // user@example.com
```

## Security Considerations

### ✅ What This Protects Against

- **Network inspection**: Sensitive data is encrypted in transit
- **Browser DevTools**: Network tab shows encrypted values
- **Man-in-the-middle**: Even if intercepted, data is encrypted

### ⚠️ What This Does NOT Protect Against

- **Authorized users**: Anyone with the encryption key can decrypt
- **Backend logs**: Backend still sees plain data before encryption
- **Database**: Database stores plain data (encryption is response-level only)

### 🔒 Best Practices

1. **Key Management:**
   - Use different keys for dev/staging/production
   - Rotate keys periodically
   - Store keys in secure vaults (AWS Secrets Manager, HashiCorp Vault, etc.)

2. **Access Control:**
   - Only authorized company personnel should have the encryption key
   - Use environment-specific keys
   - Never expose keys in client-side code (use server-side rendering if needed)

3. **Monitoring:**
   - Monitor for decryption failures
   - Log encryption/decryption errors
   - Alert on key exposure

## Troubleshooting

### Issue: Fields are not encrypted

**Check:**
1. Is `ENCRYPTION_KEY` set in backend `.env`?
2. Is the interceptor registered in `app.module.ts`?
3. Is the user an ADMIN or Internal Tester? (Admins and internal testers see plain data)
4. Is the user's email in `INTERNAL_TESTER_EMAILS` or `PREPROD_ALLOWED_EMAILS`?

### Issue: Frontend shows encrypted values

**Check:**
1. Is `VITE_ENCRYPTION_KEY` set in frontend `.env`?
2. Does the key match the backend key exactly?
3. Check browser console for decryption errors

### Issue: Decryption fails

**Check:**
1. Verify encryption key matches between backend and frontend
2. Check browser console for Web Crypto API errors
3. Ensure browser supports Web Crypto API (modern browsers only)

## Customization

### Change Which Fields Are Encrypted

Edit `backend/src/common/interceptors/encrypt-response.interceptor.ts`:

```typescript
private readonly encryptableFields = [
  'email',
  'phone',
  'customField', // Add your field here
  'nested.field.path', // Supports nested paths
];
```

### Change Encryption Algorithm

Edit `backend/src/common/services/encryption.service.ts`:

```typescript
private readonly algorithm = 'aes-256-gcm'; // Change if needed
```

### Disable Encryption for Specific Routes

You can exclude routes from encryption by modifying the interceptor:

```typescript
intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
  const request = context.switchToHttp().getRequest();
  const path = request.url;
  
  // Skip encryption for public endpoints
  if (path.includes('/public/')) {
    return next.handle();
  }
  
  // ... rest of the logic
}
```

## Production Deployment

### Environment Variables

**Backend (Production):**
```env
ENCRYPTION_KEY=<your-production-key>
INTERNAL_TESTER_EMAILS=internal1@company.com,internal2@company.com  # Optional
```

**Frontend (Production):**
```env
VITE_ENCRYPTION_KEY=<same-production-key>
```

### Key Rotation

If you need to rotate keys:

1. Generate new key
2. Update backend `.env` → Deploy backend
3. Update frontend `.env` → Deploy frontend
4. Old encrypted data will be incompatible (consider migration strategy)

## Support

For issues or questions:
1. Check logs for encryption/decryption errors
2. Verify environment variables are set correctly
3. Test with a simple encrypted field first
