# Environment Files Guide

## 📁 Environment Files Structure

We have **THREE** environment files for different deployment scenarios:

### 1️⃣ `.env.local` - Local Development
- **Purpose**: For development on your local machine
- **Database**: Local PostgreSQL
- **S3**: Mocked (no real uploads)
- **OpenAI**: Disabled (unless you add key)
- **Payments**: Razorpay test mode

### 2️⃣ `.env.test` - Test/Staging (Railway)
- **Purpose**: Testing on Railway deployment
- **Database**: Railway PostgreSQL
- **S3**: Mocked (no AWS costs)
- **OpenAI**: Can be enabled for testing
- **Payments**: Razorpay test mode
- **Domain**: test.tunectnow.com

### 3️⃣ `.env.prod` - Production (AWS)
- **Purpose**: Live production at tunectnow.com
- **Database**: AWS RDS PostgreSQL
- **S3**: Real AWS S3 bucket
- **OpenAI**: Enabled with production key
- **Payments**: Razorpay LIVE mode
- **Domain**: tunectnow.com

---

## 🔄 How to Switch Environments

### For Local Development:
```bash
cp .env.local .env
```

### For Railway Testing:
```bash
cp .env.test .env
```

### For Production Deployment:
```bash
cp .env.prod .env
```

---

## 🚨 Security Guidelines

### Local Development
- ✅ Can commit `.env.local` (no sensitive data)
- ✅ Use test API keys
- ✅ Mock S3 and OpenAI

### Test Environment
- ⚠️ Use Railway secrets for sensitive data
- ⚠️ Test mode API keys only
- ⚠️ Mock S3 to avoid costs

### Production
- 🔒 **NEVER commit `.env.prod`** with real secrets
- 🔒 Store ALL secrets in AWS Secrets Manager
- 🔒 Use IAM roles instead of hardcoded keys
- 🔒 Enable all security features (SSL, encryption, etc.)

---

## 📋 Environment Variables Checklist

### Required for All Environments:
- ✅ `DATABASE_URL`
- ✅ `JWT_SECRET`
- ✅ `FRONTEND_URL`
- ✅ `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- ✅ `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`

### Optional (Enable as needed):
- `ENABLE_S3` / AWS credentials
- `ENABLE_OPENAI` / OpenAI key
- `SMTP_*` for emails
- `TWILIO_*` for SMS
- `SENTRY_DSN` for error tracking
- `STUN_SERVERS`, `TURN_ENABLED`, `TURN_URIS`, `TURN_REST_SECRET`, `TURN_TTL_SECONDS`, `WEBRTC_DEBUG`
- `MEDIASOUP_ENABLED`, `MEDIASOUP_LOG_LEVEL`, `MEDIASOUP_RTC_MIN_PORT`, `MEDIASOUP_RTC_MAX_PORT`, `MEDIASOUP_LISTEN_IP`, `MEDIASOUP_ANNOUNCED_IP`

---

## 🗑️ Deprecated Files (Already Cleaned Up)

The following files have been consolidated:
- ~~`.env.bak`~~ (backup, no longer needed)
- ~~`.env.phase4.example`~~ (old example, replaced by `.env.local`)
- ~~`.env.example`~~ (replaced by `.env.local` as template)

---

## 🎯 Current Active Environment

Check the `NODE_ENV` variable in your `.env` file:
- `development` → Local
- `test` → Railway
- `production` → AWS

---

## 🔧 Quick Commands

```bash
# Check current environment
grep NODE_ENV .env

# Switch to local
cp .env.local .env

# Switch to test
cp .env.test .env

# Switch to production (CAREFUL!)
cp .env.prod .env

# Validate environment
npm run env:check
```

---

## 📝 Notes

1. **`.env`** is gitignored (your active config)
2. **`.env.local`** is safe to commit (template)
3. **`.env.test`** contains Railway config
4. **`.env.prod`** should NEVER have real secrets committed

**Always use environment-specific files to avoid mixing configs!**
