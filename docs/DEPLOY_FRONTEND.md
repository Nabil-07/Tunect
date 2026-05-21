# Frontend production deploy (S3 + CloudFront)

Matches your local Mac workflow:

```bash
cd Frontend
rm -rf dist && npm run build
aws s3 sync dist s3://tunectnow.com --delete
aws cloudfront create-invalidation --distribution-id EOTX0VB1WMYQ0 --paths "/*"
```

Automated on **push to `prod`** via `.github/workflows/deploy-frontend.yml`.

## GitHub secrets (required)

Repo → **Settings** → **Secrets and variables** → **Actions**:

| Secret | Value |
|--------|--------|
| `AWS_ACCESS_KEY_ID` | Your IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Your IAM secret key |
| `CLOUDFRONT_DISTRIBUTION_ID` | `EOTX0VB1WMYQ0` |
| `VITE_ENCRYPTION_KEY` | From your production Frontend env (must match backend) |
| `VITE_RAZORPAY_KEY_ID` | Live Razorpay key (e.g. `rzp_live_...`) |

**Never** commit AWS keys or live keys to git.

If keys were pasted in chat or committed anywhere, **rotate them in AWS IAM** immediately.

## S3 bucket

Production static site bucket: **`tunectnow.com`** (not `tunect-files-prod`).

## Manual deploy from Mac

```bash
cd /Users/nabilirshad/Desktop/Tunect/Frontend
rm -rf dist && npm run build
aws s3 sync dist s3://tunectnow.com --delete
aws cloudfront create-invalidation --distribution-id EOTX0VB1WMYQ0 --paths "/*"
```

Ensure AWS CLI is configured (`aws configure`) with the same IAM user.
