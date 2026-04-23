# Family Office Funds Dashboard

Turn a Google Sheet of your fund commitments into an interactive dashboard — portfolio overview, cash flows, vintages, firm roll-ups, and more. Designed for family offices, single-family trusts, and foundations that invest as LPs in venture, PE, or credit funds.

## See it in action first

**Live demo:** https://funds-dashboard-demo-946978801446.us-central1.run.app

The demo runs on 46 fabricated funds and synthetic transactions — click around, try the tabs, filter by entity, drill into a fund. Every number on the demo is made up.

## What this is

A ready-to-run dashboard that reads your fund data from a Google Sheet and presents it as a modern, interactive web app your team can sign into. Out of the box you get:

- **Portfolio view** — all commitments at a glance, sortable, with TVPI / DPI / IRR
- **Vintages** — funds grouped by vintage year with roll-up metrics
- **Cash Flows** — capital calls and distributions by year, stacked by fund
- **Firms** — every commitment to the same GP rolled up (e.g. all your Sequoia funds)
- **Activity** — year-by-year summary of what closed and what moved
- **Multi-entity filtering** — if you hold through a trust + foundation + LLC, see each one separately or all together
- **Google sign-in** — only email addresses you allow-list can access it
- A feedback form, theme and font-size controls, and a labrador named Mollie.

## What you'll need to get this running with your data

Nothing to buy. You'll need:

1. **A Google Sheet with your fund data** — doesn't have to match any specific format. Claude will adapt the app to your columns.
2. **A Google account** — personal Gmail works, Google Workspace is ideal if you want to restrict access by email domain.
3. **A Google Cloud account** — free tier easily covers a family office's traffic. Expect to pay $0-$5/month, often $0.
4. **Claude Code** — this is the key piece. Claude Code is an AI coding assistant (from Anthropic) that will do the actual setup work. You'll click through some Google Cloud screens and paste a few values; Claude handles the code.
5. **15 minutes to ~3 hours** — depending on how comfortable you are with Google Cloud's console. First-timers, budget an afternoon.

## How to get started

You don't need to read the code, clone anything manually, or follow a long written guide. Just let Claude Code do it with you.

1. **Open Claude Code.** (If you don't have it yet: [claude.ai/code](https://claude.ai/code).)
2. **Paste this as your first message:**

   > I want to build a dashboard to track my venture fund LP investments. Please go to this repository — `https://github.com/crb-kci/family-office-funds-dashboard-template` — clone it, read the CLAUDE.md setup instructions inside, and then guide me through the entire setup one step at a time. Before we start, walk me through the data security model so I understand where my data will live and who can see it. Wait for me to confirm each step before moving on.

3. **Have your Google Sheet handy** (or let Claude create a starter template with the right columns).
4. **Go at your own pace.** Claude picks up where you left off if you stop and come back.

That's it. Claude Code handles the cloning, the Google Cloud setup, adapting the app to your sheet's actual columns, and the deployment. You'll click through a few Google Cloud screens and paste some values back — Claude handles the rest.

## FAQ

### How will my colleagues and I sign in?

Google sign-in, restricted to email addresses you control. You can allow an entire domain (e.g. everyone at `yourfamilyoffice.com`) or specific individual addresses, or both. Anyone not on the allow-list is rejected after signing in. No passwords to manage.

### What kind of data do I need to have?

At minimum, one row per fund with:

- Fund name, vintage year, commitment amount
- Capital called to date, total distributed, current NAV
- The IRR, TVPI, and DPI as reported by the GP

A second tab with individual capital calls and distributions (a transaction ledger: date, fund, amount, type) powers the cash-flow charts. An optional third tab mapping funds to firms enables the firm roll-up view.

**You don't need to reshape your data to match a template.** Claude will adapt the app to your sheet's actual column names, entity structure, and sign conventions.

### What if I hold funds through multiple legal entities?

Fully supported. Many family offices hold LP stakes through a mix of a trust, a foundation, an LLC, a DAF, etc. Add an "Entity" column to your sheet with a free-text label for each row ("Smith Family Trust", "Smith Foundation", etc.), and the dashboard will let you filter per entity or see everything combined.

### Where does my data actually live? Is it secure?

Your data never leaves Google. Specifically:

- **It stays in your Google Sheet.** Same security as any Sheet you already use.
- **The app reads it using a "service account"** — a special non-human Google identity that you create and fully control. The sheet is shared *with* that service account (Viewer permission). Revoke access any time by unsharing.
- **Only people you allow-list can sign in.** The dashboard bounces everyone else at Google sign-in.
- **The app runs in your own Google Cloud project** — the code does not phone home to anyone. No analytics, no tracking, no third-party data sharing.
- **No separate database.** The app caches a snapshot of your sheet in memory for 5 minutes at a time, then re-fetches.

### How much does this cost to run?

For a typical family office with a few users: usually $0/month. Google Cloud Run has a free tier that covers low-traffic apps like this one. Heavier usage might push it to a few dollars a month. There are no software licensing fees — this repo is free to use, modify, and share.

### Who owns the data and the deployed dashboard?

You do, entirely. The dashboard runs in *your* Google Cloud project, reads from *your* Google Sheet, and uses Google sign-in configured under *your* account. Nobody else has access.

### Can I customize how it looks or add new views?

Yes. Logos, colors, labels, metrics, tab names, the included dog photo — all editable. Once the basic dashboard is running with your data, ask Claude Code to help with customizations. Common adds: your firm's branding, a portfolio pacing chart, an unfunded-commitment view, a custom export.

### What if something breaks, or I want to request a feature?

- **For setup help or small tweaks:** ask Claude Code directly — it has full context.
- **For bug reports or feature requests on the template itself:** email chris@kaporcenter.org.

### Who built this and why is it free?

Built by Chris Busselle at the [Kapor Center](https://www.kaporcenter.org) as an internal tool for tracking KCI's LP commitments, then open-sourced so other family offices could benefit. There's no commercial agenda. Use it, adapt it, share it. Pull requests welcome.

### Is there a version for direct investments (portfolio companies, not funds)?

Yes — see the sibling template: [family-office-dashboard-template](https://github.com/crb-kci/family-office-dashboard-template). Same pattern, but for direct equity investments in individual companies rather than LP fund commitments.

---

## Technical details (if you're curious)

Under the hood: Node.js + Express, reads Google Sheets via a service account, Google OAuth for sign-in, deploys to Google Cloud Run as a Docker container, no database (in-memory caching only). Full deployment steps are in [DEPLOY.md](DEPLOY.md). The step-by-step setup Claude follows lives in [CLAUDE.md](CLAUDE.md).

### Want to see it immediately before setting anything up?

```bash
npm install
DEMO_MODE=true npm start
```

Open `http://localhost:8080` and you'll see the full dashboard running against fabricated demo data — no Google setup needed.
