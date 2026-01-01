# Microsoft 365 SMTP Authentication Setup

## Error
```
Failed to send waitlist email to nabil.irshad07@gmail.com:
Error: Missing credentials for "LOGIN"
```

## Root Cause
SMTP AUTH is disabled at the tenant level in your Microsoft 365 account.

## Fix - Enable SMTP AUTH

### Step 1: Access Exchange Admin Center
1. Go to https://admin.exchange.microsoft.com
2. Sign in with your admin account (no-reply@tunectnow.com)

### Step 2: Enable SMTP AUTH for Organization
1. In the left menu, go to **Settings** → **Mail flow** → **Accepted domains**
2. OR navigate to: **Settings** → **Org-wide settings**
3. Look for **Modern authentication** or **SMTP AUTH** settings
4. **UNCHECK** the box that says "Turn off SMTP AUTH protocol for your organization"
5. Click **Save**

### Step 3: Enable SMTP AUTH for Mailbox (Alternative)
If org-wide setting doesn't work, enable for specific mailbox:

**Option A - Exchange Admin Center:**
1. Go to **Recipients** → **Mailboxes**
2. Find and click **no-reply@tunectnow.com**
3. Go to **Mail flow settings** or **Email apps**
4. Enable **Authenticated SMTP**

**Option B - PowerShell:**
```powershell
# Connect to Exchange Online
Install-Module -Name ExchangeOnlineManagement
Connect-ExchangeOnline -UserPrincipalName admin@tunectnow.com

# Enable SMTP AUTH for the mailbox
Set-CASMailbox -Identity no-reply@tunectnow.com -SmtpClientAuthenticationDisabled $false

# Verify
Get-CASMailbox -Identity no-reply@tunectnow.com | Format-List SmtpClientAuthenticationDisabled
```

### Step 4: Wait for Propagation
- Changes can take 5-10 minutes to propagate
- Some changes may take up to 24 hours

### Step 5: Test Email Sending
After enabling SMTP AUTH, restart your backend:
```bash
cd C:\Users\Nabil07\Desktop\Tunect\backend
npm run start:dev
```

Then test by creating a demo booking or triggering any email notification.

## Current Backend Configuration
Located in `backend/.env`:
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=no-reply@tunectnow.com
SMTP_PASS=autoEmail@2025*
SMTP_FROM=no-reply@tunectnow.com
```

## Verification
Once enabled, you should see in backend logs:
```
[EmailService] Email sent successfully to nabil.irshad07@gmail.com
```

Instead of:
```
[EmailService] Failed to send waitlist email
Error: Missing credentials for "LOGIN"
```

## Troubleshooting
If still not working after enabling SMTP AUTH:
1. Verify password is correct: `autoEmail@2025*`
2. Check if 2FA is enabled on the account (may need app password)
3. Ensure mailbox is licensed for Exchange Online
4. Try using app-specific password instead of account password
5. Check Microsoft 365 Security defaults aren't blocking SMTP
