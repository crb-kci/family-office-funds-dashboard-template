# Family Office Funds Dashboard — Template

A small Node/Express app that reads a Google Sheet of LP fund commitments — capital calls, distributions, NAV — rolls them up per fund, and serves a browser dashboard behind Google sign-in (restricted to your org's email domain). Designed to deploy to Google Cloud Run.

This is a scaffold — you'll point it at your own sheet, plug in your own OAuth credentials, and customize the UI in `dashboard.html`. For a direct-investment (per-company) version of this template, see the sibling `family-office-dashboard-template`.

## What's in the box

| File | Purpose |
|---|---|
| `server.js` | Express app: auth, sheet fetching, caching, JSON API |
| `dashboard.html` | Minimal frontend: KPIs + fund table. Starting point for you to extend. |
| `package.json` | Node deps |
| `Dockerfile` | For Cloud Run |
| `.env.example` | Template for all required env vars |
| `DEPLOY.md` | Step-by-step Cloud Run deployment |
| `CLAUDE.md` | Instructions your AI pair (Claude Code) can read to help you set this up |

## Quickstart

1. `cp .env.example .env` and fill in the values (see `DEPLOY.md` for how to get each one).
2. `npm install`
3. `npm start`
4. Open `http://localhost:8080` — you'll be bounced to Google sign-in, and only email addresses in `ALLOWED_DOMAINS` / `ALLOWED_EMAILS` can get in.

## Data model

The app expects two tabs in your Google Sheet (names configurable via env vars). Column matching is **case-insensitive but name-based** — the order doesn't matter, and extra columns are ignored. Missing columns become empty/zero.

### `Funds` tab (default name)

One row per fund. If you hold funds through multiple legal vehicles (a trust, a foundation, an LLC), use one row per fund × entity; otherwise leave `Entity` blank.

- `Fund Name` — name of the fund
- `Entity` — optional; which of your vehicles holds this commitment
- `Vintage` — vintage year
- `Commitment` — total capital committed, positive
- `Called` — capital called to date (the app normalizes negatives)
- `Distributed` — total distributed
- `NAV` — current reported NAV
- `IRR`, `TVPI`, `DPI` — as reported by the GP
- `% Funded` — optional

### `Transactions` tab (default name)

Ledger of capital calls and distributions.

- `Entity` — which vehicle sent/received the money
- `Fund` — fund name (should match `Funds.Fund Name`)
- `Date` — transaction date (Sheets date or serial number both work)
- `Type` — e.g. `Capital Call`, `Distribution`
- `Amount` — signed; capital calls negative, distributions positive is typical

### `Fund Mapping` tab (optional)

If you want to group funds by firm/GP (e.g. roll up all Sequoia funds together), add a third tab with:

- `Fund Name`
- `Firm`

If your sheet is shaped differently, adjust the column names in `fetchSheetData()` in `server.js`.

## Sharing the sheet with the app

The app authenticates to Google Sheets using a **service account** (not your personal Google login). After creating the service account, share your sheet with its email (looks like `something@your-project.iam.gserviceaccount.com`) — Viewer permission is enough.

## Deploying

See `DEPLOY.md` for a full Cloud Run walkthrough.

## Customizing the UI

`dashboard.html` is intentionally minimal — one KPI row and one table. Add tabs, charts, filters, vintage/firm breakdowns, cash-flow timelines, etc. as needed. The data contract is whatever `/api/data` returns (see `server.js`). Your Claude can help; see `CLAUDE.md`.
