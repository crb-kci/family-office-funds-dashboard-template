# Deployment Guide — Google Cloud Run

End-to-end walkthrough: from nothing to a live fund dashboard behind Google sign-in.

## Prerequisites
- A Google account with access to [Google Cloud Console](https://console.cloud.google.com)
- `gcloud` CLI installed locally, OR willingness to use Cloud Shell (the `>_` icon in the Cloud Console top bar)
- Git

---

## Step 1: Create a Google Cloud Project
1. Go to https://console.cloud.google.com
2. Click the project dropdown → **New Project**
3. Give it a name (e.g. `funds-dashboard`) → **Create**
4. Make sure it's your active project

## Step 2: Enable Required APIs
In **APIs & Services → Library**, enable:
- **Cloud Run Admin API**
- **Cloud Build API**
- **Artifact Registry API**
- **Google Sheets API**

Or from Cloud Shell:
```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com sheets.googleapis.com
```

## Step 3: Set Up Google OAuth
1. **APIs & Services → OAuth consent screen**
   - User type: **Internal** if you have Google Workspace (simpler); otherwise **External**.
   - App name: e.g. `Funds Dashboard`
   - User support email + developer contact email: your email
   - Authorized domains: your org's domain (e.g. `yourfamilyoffice.com`)
   - Save and continue through the remaining screens.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `Funds Dashboard`
   - Authorized redirect URIs: leave blank for now (we'll add after we know the Cloud Run URL)
   - **Create** — copy the **Client ID** and **Client Secret**. You'll need both.

## Step 4: Create a Service Account for Sheets Access
1. **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `sheets-reader`
   - Skip role assignment (no project-level roles needed)
   - **Done**
2. Click the new service account → **Keys → Add Key → Create new key → JSON**. A key file downloads — **treat this like a password**. Don't commit it.
3. Copy the service account's email (looks like `sheets-reader@<project>.iam.gserviceaccount.com`).
4. Open the Google Sheet that holds your fund data, click **Share**, paste the service account email, give it **Viewer** access.

## Step 5: Prepare the Code
```bash
# Clone or copy this template
cd path/to/family-office-funds-dashboard-template

# Install deps (for local testing; Cloud Build will do its own install)
npm install

# Create local env file (for testing before deploying)
cp .env.example .env
# Edit .env — fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
# SPREADSHEET_ID, ALLOWED_DOMAINS, SESSION_SECRET, and either
# GOOGLE_APPLICATION_CREDENTIALS (path to the JSON key file) or
# GOOGLE_SERVICE_ACCOUNT_KEY (the JSON content itself).

# Test locally
npm start
# Visit http://localhost:8080 — sign in with Google, confirm data loads.
```

Generate a session secret:
```bash
openssl rand -hex 32
```

## Step 6: Push to a Git Repo (optional but recommended)
```bash
git init
git add .
git commit -m "Initial dashboard"
# Create a private repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/funds-dashboard.git
git branch -M main
git push -u origin main
```

## Step 7: Deploy to Cloud Run
Set your project:
```bash
gcloud config set project YOUR_PROJECT_ID
```

Deploy. Replace the placeholders — note that `GOOGLE_SERVICE_ACCOUNT_KEY` takes the **entire JSON contents** of the key file as a single-line value.

```bash
# Read the service account JSON into a variable (adjust path)
SA_KEY=$(cat /path/to/service-account.json)

gcloud run deploy funds-dashboard \
  --source=. \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-env-vars="^@@^GOOGLE_CLIENT_ID=YOUR_CLIENT_ID@@GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET@@SPREADSHEET_ID=YOUR_SPREADSHEET_ID@@ALLOWED_DOMAINS=yourfamilyoffice.com@@SESSION_SECRET=$(openssl rand -hex 32)@@ORG_NAME=Funds Dashboard@@NODE_ENV=production@@GOOGLE_SERVICE_ACCOUNT_KEY=$SA_KEY"
```

The `^@@^` prefix tells gcloud to use `@@` as the env var separator (needed because the JSON key contains commas and newlines).

After deploy you'll get a URL like:
```
https://funds-dashboard-XXXXX-uc.a.run.app
```

## Step 8: Wire Up OAuth Redirect
1. **APIs & Services → Credentials → your OAuth client ID**
2. **Authorized redirect URIs** → add: `https://funds-dashboard-XXXXX-uc.a.run.app/auth/google/callback`
3. **Authorized JavaScript origins** → add: `https://funds-dashboard-XXXXX-uc.a.run.app`
4. **Save**

Then tell Cloud Run the callback URL:
```bash
gcloud run services update funds-dashboard \
  --region=us-central1 \
  --update-env-vars="CALLBACK_URL=https://funds-dashboard-XXXXX-uc.a.run.app/auth/google/callback"
```

## Step 9: Test
Visit your Cloud Run URL. You should be redirected to Google, sign in with an allowed email, and land on the dashboard.

If something breaks, hit `/api/debug` while signed in — it shows how many rows loaded and any last error. Cloud Run logs are under **Cloud Run → your service → Logs**.

---

## Redeploying
```bash
git add . && git commit -m "Update" && git push  # optional
gcloud run deploy funds-dashboard --source=. --region=us-central1
```
Env vars persist between deploys.

## Continuous Deployment (optional)
Cloud Run → your service → **Set up continuous deployment** → connect your GitHub repo → select `main`. Every push redeploys automatically.

---

## Optional: Wire up the feedback form

The dashboard has a "Send feedback" button in the bottom-right corner of every page. When a user clicks it, they fill out a short form (name, category, comment) and hit submit. The app appends a row to a Google Sheet you control — so you get a running list of bug reports, feature requests, and comments from your users, with no extra infrastructure.

It's completely optional. Leave it off and the feedback button works but silently discards submissions. To turn it on:

### 1. Create a feedback sheet
- Go to [sheets.google.com](https://sheets.google.com) → create a new blank spreadsheet.
- Name it whatever you want (e.g. "Dashboard Feedback"). This is a **different** sheet from your portfolio data sheet — keep them separate.
- Optionally add a header row in Row 1: `Timestamp | Name | Email | Category | Page | Comment`. The app won't add it for you, but it makes the sheet readable. Whether or not you add headers, the app always writes starting at the next empty row.

### 2. Share the sheet with the service account
- Click **Share** in the top-right.
- Paste the same service account email you used for your data sheet (looks like `sheets-reader@your-project.iam.gserviceaccount.com`).
- Give it **Editor** access this time, not Viewer. The app needs to append rows, which requires write access. (Your portfolio data sheet only needs Viewer because the app just reads it.)

### 3. Copy the sheet ID
- With the sheet open, look at its URL. The ID is the long string between `/d/` and `/edit`. Example: in `https://docs.google.com/spreadsheets/d/1a2B3c4D5e6F7g8H9i0J/edit`, the ID is `1a2B3c4D5e6F7g8H9i0J`.

### 4. Set `FEEDBACK_SHEET_ID` on the deployed service
```bash
gcloud run services update funds-dashboard \
  --region=us-central1 \
  --update-env-vars="FEEDBACK_SHEET_ID=1a2B3c4D5e6F7g8H9i0J"
```
(Or edit the service in the Cloud Run console → **Variables & Secrets** tab.)

### 5. Test it
- Visit your dashboard, hit the feedback button, submit a test message.
- Open the sheet — you should see a new row with the timestamp, your name and email (from your Google sign-in), category, page path, and comment.

If nothing shows up, the usual culprits are:
- Sheet shared with the service account as **Viewer** instead of **Editor** (the most common mistake).
- Sheet ID typo. Double-check against the URL.
- You haven't redeployed after adding the env var. `gcloud run services update` above handles it, but if you just edited `.env` locally, that only applies on `npm start`, not on the live Cloud Run service.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | yes | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | yes | OAuth client secret |
| `CALLBACK_URL` | yes (prod) | Full OAuth callback URL |
| `ALLOWED_DOMAINS` | one of these | Comma-separated email domain allowlist |
| `ALLOWED_EMAILS` | one of these | Comma-separated email allowlist |
| `SPREADSHEET_ID` | yes | Google Sheet ID |
| `FUNDS_TAB` | no | Funds tab name (default `Funds`) |
| `TXNS_TAB` | no | Transactions tab name (default `Transactions`) |
| `MAPPING_TAB` | no | Optional fund → firm mapping tab |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | one of these | Full service account JSON (prod) |
| `GOOGLE_APPLICATION_CREDENTIALS` | one of these | Path to JSON key file (local dev) |
| `SESSION_SECRET` | yes | Random string for session signing |
| `ORG_NAME` | no | Branding: shown in sign-in page + header |
| `ORG_TAGLINE` | no | Branding: subtitle under ORG_NAME |
| `SUPPORT_EMAIL` | no | Shown on access-denied page |
| `FEEDBACK_SHEET_ID` | no | Enables `/api/feedback` if set |
| `NODE_ENV` | no | Set to `production` for secure cookies |
| `PORT` | no | Auto-set by Cloud Run |
| `CACHE_TTL_MS` | no | Data refresh interval (default 6h) |
