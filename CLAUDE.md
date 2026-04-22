# Instructions for Claude (Claude Code)

You are helping the user stand up a family-office **fund** dashboard from this template — LP commitments to venture/PE/credit funds, capital calls, distributions, NAV, and fund-level performance metrics (IRR/TVPI/DPI). Your job is to walk them through setup one step at a time, adapt the code to their actual Google Sheet, and help them deploy it to Google Cloud Run. Assume the user is reasonably technical but not a full-time developer — they can follow instructions, run commands, and click through a Cloud Console UI, but don't assume they've used Node, gcloud, or GCP IAM before.

## How to work with this user

- **Go one step at a time.** Don't dump the full plan — give the next concrete action, wait for them to complete it (or share an error), then give the next.
- **Ask before assuming.** If their sheet's column names, tabs, entity structure, or domain aren't obvious, ask rather than guess. The defaults in `server.js` are illustrative — their sheet will differ.
- **Prefer their existing sheet shape.** Don't ask them to restructure their data to match the template; adapt the template's parsing code to match their sheet. Edit `fetchSheetData()` in `server.js` — rename column lookups, add new ones, drop ones they don't have.
- **Show don't tell.** When giving a command, give the exact command. When editing code, make the edit yourself and show the diff.
- **Secrets never go in git.** Credentials, spreadsheet IDs the user considers sensitive, and service account keys must only live in `.env` locally or as Cloud Run env vars in production.

## The setup flow

Work through these phases in order. Skip forward only if the user says they've already done a step.

### Phase 1 — Local sanity check
1. Confirm Node 20+ is installed (`node --version`).
2. Run `cp .env.example .env`. Don't fill it in yet — just make sure it exists.
3. Run `npm install`.
4. At this point `npm start` will complain about missing env vars. That's expected. Reassure them.

### Phase 2 — Google Cloud project + OAuth
Walk them through `DEPLOY.md` Steps 1–3 (create GCP project, enable APIs, configure OAuth consent screen + create OAuth client ID). A few things to check with them:
- **Consent screen user type**: if they have Google Workspace for their org, choose "Internal" (simpler, limited to their org). If not, choose "External" and add test users.
- **Authorized domains** on the consent screen: their org's domain (e.g. `yourfamilyoffice.com`).
- They end this phase with a **Client ID** and **Client Secret**. Have them paste both into `.env`.

### Phase 3 — Service account for Sheets access
1. In Cloud Console → **IAM & Admin → Service Accounts → Create Service Account**. Name it `sheets-reader`.
2. No roles needed — this account only needs access via sheet sharing, not IAM.
3. After creating: click the account → **Keys → Add Key → Create new key → JSON**. A key file downloads.
4. For local dev: point `GOOGLE_APPLICATION_CREDENTIALS` in `.env` at the downloaded JSON file path. (Never commit this file — `.gitignore` already excludes `service-account*.json`.)
5. Open the service account's email (shown on its page, looks like `sheets-reader@<project>.iam.gserviceaccount.com`) and have them **share their Google Sheet with that email** as Viewer.

### Phase 4 — Point at the user's sheet
1. Ask the user for the sheet's URL or ID. The ID is the long string in the URL between `/d/` and `/edit`.
2. Set `SPREADSHEET_ID` in `.env`.
3. Ask what tab(s) the data lives in. Set `FUNDS_TAB` (per-fund aggregates) and `TXNS_TAB` (capital-call/distribution ledger). `MAPPING_TAB` is optional (fund → firm) and can be left at the default — missing tabs are handled gracefully.
4. **Ask about multi-entity structure.** Many family offices hold LP stakes through multiple vehicles (a trust, a foundation, an LLC). If yes, confirm there's an "Entity" column (or equivalent) in both tabs so the dashboard can show holdings per vehicle. If they only use one vehicle, the `Entity` field can be blank.
5. **Look at the sheet's actual columns.** Either ask the user to paste the header row from each tab, or offer to fetch it via a quick script. Compare against the expected columns in `server.js` (`fetchSheetData()`). For each mismatch:
   - If the column exists under a different name → update the `headerIdx(..., '...')` lookup in `server.js`.
   - If the column doesn't exist → remove that field from the pushed object.
   - If the sheet has additional columns they care about → add new fields and propagate them to the frontend.
6. **Watch for sign conventions.** Capital calls are often recorded as negatives (outflows) and distributions as positives. The template normalizes `Called` to positive via `Math.abs()`. Confirm with the user what their convention is — if their `Called` column is already positive, `Math.abs()` is harmless; if their `Distributed` is negative, flip it.
7. Set `ALLOWED_DOMAINS` (and/or `ALLOWED_EMAILS`). This is the allowlist — everyone else who tries to sign in is rejected.
8. Generate a session secret: `openssl rand -hex 32` and put it in `SESSION_SECRET`.
9. Set `ORG_NAME`, `ORG_TAGLINE`, `SUPPORT_EMAIL` to something reasonable.
10. Run `npm start`. Visit `http://localhost:8080`. They should be bounced to Google sign-in, then land on the dashboard.

### Phase 5 — Debug if needed
Common issues:
- **"Access Denied" after sign-in** → their email isn't in `ALLOWED_DOMAINS`/`ALLOWED_EMAILS`, or the wrong Google account is signed in to the browser.
- **Data is empty** → check `/api/debug` (while signed in) for `totalFunds`, `totalTxns`, `error`, and `fundsByEntity`. Common causes: wrong tab name, sheet not shared with the service account, column name mismatch, all rows filtered out by the "skip empty rows" check (meaning commitment/called/distributed/NAV/vintage are all zero/blank — possibly column mismatch).
- **Metrics look wrong** → sign-convention issue (see Phase 4 step 6). Check a single fund row in the sheet vs. `/api/data`.
- **"No service account credentials configured"** → `GOOGLE_APPLICATION_CREDENTIALS` path is wrong, or the file is unreadable.
- **OAuth redirect URI mismatch** → the redirect URI in the OAuth client must exactly match `CALLBACK_URL` (including scheme, host, port, and path).

### Phase 6 — Customize the UI
`dashboard.html` is a minimal skeleton. Once data is flowing, ask the user what views they want. Common additions for a funds dashboard:
- **Vintage view** — funds grouped by vintage year, with vintage-level TVPI/DPI/IRR
- **Firm view** — roll up all commitments to the same GP (needs `Fund Mapping` tab)
- **Entity view** — one tab per legal vehicle, showing only that vehicle's commitments
- **Cash flows** — stacked bar of capital calls (negative) vs. distributions (positive) by year
- **J-curve / NAV timeline** — hard to do without quarterly NAV history; skip unless they have that data
- **Commitment pacing** — unfunded commitment by vintage year

Build incrementally — one view at a time, ship each before starting the next. All data comes from `/api/data`.

### Phase 7 — Deploy to Cloud Run
Follow `DEPLOY.md` Steps 5–8. Key things to get right:
- Paste the full service account JSON as the `GOOGLE_SERVICE_ACCOUNT_KEY` env var value (single line, wrapped in single quotes in the shell). Don't use `GOOGLE_APPLICATION_CREDENTIALS` in Cloud Run — there's no filesystem path to point to.
- After first deploy, the user gets a Cloud Run URL. Update the OAuth client's authorized redirect URI to that URL + `/auth/google/callback`, then set `CALLBACK_URL` on the service to match.
- Test the live URL end-to-end before calling it done.

## Things not to do

- Don't invent columns in the sheet that aren't there. Ask.
- Don't recommend committing `.env` or service account JSON to git, even to a private repo.
- Don't add features the user didn't ask for. Keep scope tight; ship the basic dashboard working first.
- Don't skip validation — after each phase, confirm the result with the user before moving on.
- Don't assume GP-reported metrics (IRR/TVPI/DPI) can be recomputed from transactions alone — they often can't (valuations are point-in-time, IRR needs a full cash flow series including final NAV). Use what the GP reports; only compute portfolio-level aggregates from the per-fund roll-ups.
