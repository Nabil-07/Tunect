# Backend production deploy (EC2 + GitHub Actions)

## Where each file/key lives

| What | Where | Never do this |
|------|--------|----------------|
| `tunect-prod-key.pem` (private key) | **Mac:** `~/Downloads/tunect-prod-key.pem` | Commit to GitHub, email, or put on EC2 |
| Same key for CI | **GitHub secret** `EC2_SSH_KEY` (paste full `.pem` text) | Upload `.pem` as a repo file |
| Server host | **GitHub secret** `EC2_HOST` = `3.109.113.199` | Hardcode real IP in public docs if you prefer secrets only |
| SSH user | **GitHub secret** `EC2_USER` = `ubuntu` | — |
| Public key | **EC2:** `~/.ssh/authorized_keys` (AWS key pair) | Put private key on server |
| Production env | **EC2:** `~/Tunect/backend/.env` | Commit `.env` to git |
| App code (deployed) | **EC2:** `~/Tunect/backend/` | — |
| Workflow file | **Git:** `.github/workflows/deploy-backend.yml` on **`prod`** branch | Expect deploy when pushing only to `main` |

---

## Step 1 — Mac: keep the `.pem` for manual SSH

1. File stays in Downloads: `~/Downloads/tunect-prod-key.pem`
2. Terminal:
   ```bash
   chmod 400 ~/Downloads/tunect-prod-key.pem
   ssh -i ~/Downloads/tunect-prod-key.pem ubuntu@3.109.113.199
   ```
3. Confirm you land in the server and can run:
   ```bash
   cd ~/Tunect/backend
   ls -la .env
   ```

---

## Step 2 — GitHub: add three Actions secrets

1. Open: **https://github.com/Nabil-07/Tunect**
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret** — create each:

### `EC2_HOST`

- **Name:** `EC2_HOST`
- **Value:** `3.109.113.199`

### `EC2_USER`

- **Name:** `EC2_USER`
- **Value:** `ubuntu`

### `EC2_SSH_KEY`

- **Name:** `EC2_SSH_KEY`
- **Value:** entire private key file:
  1. Mac: `open -a TextEdit ~/Downloads/tunect-prod-key.pem`
  2. Select all (Cmd+A), copy
  3. Paste into the secret value box
  4. Must include lines:
     ```
     -----BEGIN ... PRIVATE KEY-----
     ...
     -----END ... PRIVATE KEY-----
     ```
- **Save**

Do **not** create a secret for the public key (`ssh-ed25519 AAAAC3...`).

---

## Step 3 — EC2: one-time server setup

SSH in (Step 1), then:

```bash
# App directory (you already use this)
cd ~/Tunect/backend

# Production .env must exist (copy from your Mac once — do not commit)
# On your Mac:
# scp -i ~/Downloads/tunect-prod-key.pem \
#   /path/to/your/production.env \
#   ubuntu@3.109.113.199:~/Tunect/backend/.env

sudo npm install -g pm2
pm2 list    # note your process name if not "tunect-backend"
```

---

## Step 4 — Git: workflow only deploys **prod** branch code

- Workflow triggers on **push to `prod`** (and manual **Run workflow**).
- Checkout always uses **`ref: prod`** — even if the workflow file exists on `main`, deploy uses **prod** code.
- Pushes to **`main` do not deploy** the backend.

Push workflow updates to prod:

```bash
git checkout prod
git add .github/workflows/deploy-backend.yml docs/DEPLOY_BACKEND.md
git commit -m "Fix backend deploy: prod-only checkout and secret validation"
git push origin prod
```

---

## Step 5 — Run / verify GitHub Action

1. **Actions** → **Deploy Backend to EC2**
2. **Run workflow** → branch **prod** → Run
3. If it fails in ~10s, open the failed step — usually **Validate GitHub secrets** (secrets missing) or **Configure SSH key** (bad `EC2_SSH_KEY` paste).

---

## Branch layout (recommended)

| Branch | Backend auto-deploy? |
|--------|----------------------|
| `main` | No |
| `prod` | Yes (on `backend/**` changes) |

Optional: keep `deploy-backend.yml` only on `prod` by not merging workflow-only commits to `main`, or delete the workflow file on `main` in a dedicated commit. Deploy still only runs on `prod` pushes because of `on.push.branches: [prod]`.
