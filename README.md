# Family Office Funds Dashboard — Template

A Node/Express app that reads a Google Sheet of LP fund commitments — capital calls, distributions, NAV — rolls them up per fund, and serves a browser dashboard behind Google sign-in (restricted to your org's email domain). Designed to deploy to Google Cloud Run.

The UI is already built out: tabs for Portfolio / Vintages / Cash Flows / Firms / Activity, fund drill-downs, per-entity filtering, cash-flow waterfall, firm roll-ups, year-by-year activity, feedback form, and a theme/font-size picker. You just configure the environment, point it at your sheet, and deploy. For a direct-investment (per-company) version of this template, see the sibling `family-office-dashboard-template`.

## What's in the box

| File | Purpose |
|---|---|
| `server.js` | Express app: auth, sheet fetching, caching, JSON API, SPA routes |
| `dashboard.html` | Full frontend: all tabs, charts, modals, themes |
| `demo-data.json` | 46 fabricated funds + 352 synthetic transactions for demo mode |
| `public/mollie.jpg` | Mollie (feedback success screen). Swap for your own photo or remove. |
| `package.json` | Node deps |
| `Dockerfile` | For Cloud Run |
| `.env.example` | Template for all required env vars |
| `DEPLOY.md` | Step-by-step Cloud Run deployment |
| `CLAUDE.md` | Instructions your AI pair (Claude Code) can read to help you set this up |

## Quickstart

### See it working in 30 seconds (demo mode)

```bash
npm install
DEMO_MODE=true npm start
```

Open `http://localhost:8080`. No Google setup, no OAuth, no service account — the full dashboard runs against `demo-data.json` (46 fabricated funds, 352 synthetic transactions) and a yellow banner indicates you're in demo mode.

### Connect to your own sheet

1. `cp .env.example .env` and fill in the values (see `DEPLOY.md` for how to get each one).
2. `npm install`
3. `npm start`
4. Open `http://localhost:8080` — you'll be bounced to Google sign-in, and only email addresses in `ALLOWED_DOMAINS` / `ALLOWED_EMAILS` can get in.

A live demo of this template is available at **https://funds-dashboard-demo-946978801446.us-central1.run.app** (source: [family-office-funds-dashboard-demo](https://github.com/crb-kci/family-office-funds-dashboard-demo), separate repo, 46 fabricated funds).

## Data model

The app expects two tabs in your Google Sheet (names configurable via env vars). Column matching is **case-insensitive but name-based** — the order doesn't matter, and extra columns are ignored. Missing columns become empty/zero.

### `Funds` tab (default name)

One row per fund. If you hold funds through multiple legal vehicles — a family office and a foundation, two different trusts, an LLC and a DAF, etc. — use one row per fund × entity and the dashboard will let you filter/view per vehicle. If you only invest through one entity, leave the `Entity` column blank.

- `Fund Name` — name of the fund
- `Entity` — optional; which of your vehicles holds this commitment (free-text label — use whatever names you use internally, e.g. "Family Trust", "Foundation", "Main LLC")
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

The out-of-box dashboard has Portfolio, Vintages, Cash Flows, Firms, and Activity views; per-entity filtering; a feedback form; theme + font-size controls; and a labrador named Mollie who rewards you for submitting feedback. Edit `dashboard.html` to swap logos, colors, copy, or metrics. Data contract is whatever `/api/data` returns (see `server.js`). Your Claude can help; see `CLAUDE.md`.
