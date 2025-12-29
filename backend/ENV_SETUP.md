# Tunect Environment Configuration

This project uses **4 environment files** for different deployment stages:

| File | Environment | Database | Purpose |
|------|-------------|----------|---------|
| `.env.local` | Local Dev | Local PostgreSQL | Development on your machine |
| `.env.test` | Test/QA | Railway PostgreSQL | QA testing on Railway |
| `.env.preprod` | Pre-Production | AWS RDS (sandbox) | AWS staging before prod |
| `.env.prod` | Production | AWS RDS (production) | **Real users on tunectnow.com** |

## 🔄 Switching Environments

The active configuration is always in `.env`. To switch environments:

```bash
# For local development
cp .env.local .env

# For Railway testing
cp .env.test .env

# For AWS pre-production
cp .env.preprod .env

# For production deployment
cp .env.prod .env
```

## 🚀 Current Setup

| Environment | Database Location | AI/S3 | Payment Mode |
|-------------|-------------------|-------|--------------|
| **Local** | `localhost:5432` | Mock (disabled) | Test mode |
| **Test** | Railway PostgreSQL | Mock (disabled) | Test mode |
| **PreProd** | AWS RDS (sandbox) | **Enabled** | Test mode |
| **Prod** | AWS RDS (production) | **Enabled** | **LIVE mode** |

## ⚙️ Key Differences

### Local Development (`.env.local`)
- Local PostgreSQL database
- All AI/S3 features in **mock mode** (no API calls)
- Razorpay test keys
- No email sending

### Test Environment (`.env.test`)
- Railway hosted database
- Mock AI/S3 for faster testing
- Same test payment keys
- Limited email

### Pre-Production (`.env.preprod`)
- AWS RDS sandbox database
- **Real S3 and OpenAI** enabled
- Test payment mode
- Full email enabled
- Sentry monitoring

### Production (`.env.prod`)
- AWS RDS production database with high connection limits
- Full S3, OpenAI, monitoring enabled
- **LIVE Razorpay keys** - real money!
- Production email service
- Rate limiting enabled

## 🔐 Security Best Practices

### ⚠️ Never commit real secrets!

1. **Local/Test**: Okay to use placeholder secrets
2. **PreProd/Prod**: Use AWS Secrets Manager or environment variables in deployment platform

### Required Changes Before Production

Replace these placeholders in `.env.prod`:

- `JWT_SECRET` → Strong random 256-bit secret
- `DATABASE_URL` → Real RDS connection string
- `RAZORPAY_KEY_ID` → Live Razorpay key
- `RAZORPAY_KEY_SECRET` → Live secret
- `AWS_ACCESS_KEY_ID` → Production IAM credentials
- `OPENAI_API_KEY` → Production API key
- `SENTRY_DSN` → Production Sentry project

## 📝 Environment Variable Reference

### Database
- `DATABASE_URL` - PostgreSQL connection string
- `SHADOW_DATABASE_URL` - For Prisma migrations

### Authentication
- `JWT_SECRET` - Token signing key
- `GOOGLE_CLIENT_ID` - OAuth client
- `GOOGLE_CLIENT_SECRET` - OAuth secret

### Payment
- `RAZORPAY_KEY_ID` - Test or live key
- `RAZORPAY_KEY_SECRET` - Test or live secret
- `RAZORPAY_WEBHOOK_SECRET` - Webhook validation

### AWS S3
- `ENABLE_S3` - `true`/`false` toggle
- `AWS_S3_BUCKET_NAME` - S3 bucket
- `AWS_ACCESS_KEY_ID` - IAM user key
- `AWS_SECRET_ACCESS_KEY` - IAM secret

### OpenAI
- `ENABLE_OPENAI` - `true`/`false` toggle
- `OPENAI_API_KEY` - API key
- `OPENAI_MODEL` - Model name (default: `gpt-4o-mini`)

## 🎯 Deployment Checklist

### Before deploying to production:

- [ ] Copy `.env.prod` to `.env`
- [ ] Replace all placeholder secrets
- [ ] Verify database connection string
- [ ] Switch Razorpay to **LIVE mode**
- [ ] Enable S3 and OpenAI
- [ ] Configure production CORS origins
- [ ] Set up Sentry monitoring
- [ ] Test all payment flows in test mode first
- [ ] Run database migrations
- [ ] Enable rate limiting

## 🐛 Troubleshooting

### "Cannot connect to database"
- Check `DATABASE_URL` is correct for your environment
- Verify firewall rules allow connections
- For Railway: Check service is running

### "S3 upload failed"
- If `ENABLE_S3=false`, files use mock URLs
- If enabled, verify AWS credentials and bucket permissions

### "OpenAI error"
- If `ENABLE_OPENAI=false`, AI features return mock data
- If enabled, check API key and quota

### "Payment webhook failed"
- Verify `RAZORPAY_WEBHOOK_SECRET` matches Razorpay dashboard
- Check webhook URL is publicly accessible

## 📊 Connection Limits

| Environment | DB Connections | Pool Timeout |
|-------------|----------------|--------------|
| Local | 5 (default) | 10s |
| Test | 10 | 20s |
| PreProd | 20 | 30s |
| **Prod** | **50** | **30s** |

These are configured in the `DATABASE_URL` query parameters.
