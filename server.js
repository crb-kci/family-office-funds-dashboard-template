const express = require('express');
const cookieSession = require('cookie-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Config (all via env) ─────────────────────────────────
// ALLOWED_EMAILS: comma-separated email allowlist, OR
// ALLOWED_DOMAINS: comma-separated domain allowlist (e.g. "example.com,foo.com")
// At least one of these must be set.
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const FUNDS_TAB = process.env.FUNDS_TAB || 'Funds';
const TXNS_TAB = process.env.TXNS_TAB || 'Transactions';
const MAPPING_TAB = process.env.MAPPING_TAB || 'Fund Mapping';
const CACHE_TTL = Number(process.env.CACHE_TTL_MS) || 6 * 60 * 60 * 1000;

const ORG_NAME = process.env.ORG_NAME || 'Fund Dashboard';
const ORG_TAGLINE = process.env.ORG_TAGLINE || '';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || '';

if (!SPREADSHEET_ID) {
  console.warn('WARNING: SPREADSHEET_ID not set — /api/data will return empty.');
}
if (ALLOWED_EMAILS.length === 0 && ALLOWED_DOMAINS.length === 0) {
  console.warn('WARNING: No ALLOWED_EMAILS or ALLOWED_DOMAINS set — all sign-ins will be rejected.');
}

function isAllowedEmail(email) {
  if (!email) return false;
  const e = email.toLowerCase();
  if (ALLOWED_EMAILS.includes(e)) return true;
  const domain = e.split('@')[1];
  if (domain && ALLOWED_DOMAINS.includes(domain)) return true;
  return false;
}

// ── Data cache ───────────────────────────────────────────
let dataCache = {
  funds: [],
  txns: [],
  firmByFund: {},
  lastFetch: 0,
  loading: false,
  error: null
};

// ── Google Sheets client ─────────────────────────────────
function getSheetsClient() {
  let auth;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  } else {
    throw new Error('No service account credentials configured (set GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS).');
  }
  return google.sheets({ version: 'v4', auth });
}

// ── Helpers ──────────────────────────────────────────────
function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/[$,%]/g, ''));
  return isNaN(n) ? 0 : n;
}
function parseNumOrNull(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/[$,%]/g, ''));
  return isNaN(n) ? null : n;
}
function sheetSerialToDate(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + val * 86400000);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}
function isoDate(d) {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}
function headerIdx(headers, name) {
  return headers.findIndex(h => (h || '').toString().trim().toLowerCase() === name.toLowerCase());
}

// ── Fetch and process spreadsheet data ───────────────────
async function fetchSheetData() {
  if (!SPREADSHEET_ID) return;
  if (dataCache.loading) return;
  dataCache.loading = true;

  try {
    const sheets = getSheetsClient();
    console.log('Fetching data from Google Sheets...');

    const ranges = [`'${FUNDS_TAB}'`, `'${TXNS_TAB}'`];
    if (MAPPING_TAB) ranges.push(`'${MAPPING_TAB}'`);

    const results = await Promise.all(ranges.map(range =>
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE'
      }).catch(err => {
        console.warn(`Could not read range ${range}: ${err.message}`);
        return { data: { values: [] } };
      })
    ));

    const fundsRes = results[0];
    const txnsRes = results[1];
    const mappingRes = results[2] || { data: { values: [] } };

    // ── Optional: fund → firm mapping ────────────────────
    // Expected columns: "Fund Name", "Firm"
    const mappingRows = mappingRes.data.values || [];
    const mappingHeaders = mappingRows[0] || [];
    const fundCol = headerIdx(mappingHeaders, 'Fund Name');
    const firmCol = headerIdx(mappingHeaders, 'Firm');
    const firmByFund = {};
    if (fundCol >= 0 && firmCol >= 0) {
      for (let i = 1; i < mappingRows.length; i++) {
        const row = mappingRows[i] || [];
        const fund = (row[fundCol] || '').toString().trim();
        const firm = (row[firmCol] || '').toString().trim();
        if (fund && firm) firmByFund[fund] = firm;
      }
    }

    // ── Funds tab ────────────────────────────────────────
    // Expected columns (customize to match your sheet):
    //   Fund Name, Entity, Vintage,
    //   Commitment, Called, Distributed, NAV,
    //   IRR, TVPI, DPI, % Funded
    // One row per fund × entity (i.e. each legal vehicle's stake in each fund).
    // If you only hold funds through a single entity, "Entity" can be blank.
    const fundRows = fundsRes.data.values || [];
    const fHeaders = fundRows[0] || [];
    const f = {
      fundName: headerIdx(fHeaders, 'Fund Name'),
      entity: headerIdx(fHeaders, 'Entity'),
      vintage: headerIdx(fHeaders, 'Vintage'),
      commitment: headerIdx(fHeaders, 'Commitment'),
      called: headerIdx(fHeaders, 'Called'),
      distributed: headerIdx(fHeaders, 'Distributed'),
      nav: headerIdx(fHeaders, 'NAV'),
      irr: headerIdx(fHeaders, 'IRR'),
      tvpi: headerIdx(fHeaders, 'TVPI'),
      dpi: headerIdx(fHeaders, 'DPI'),
      pctFunded: headerIdx(fHeaders, '% Funded')
    };

    const funds = [];
    for (let i = 1; i < fundRows.length; i++) {
      const r = fundRows[i];
      if (!r || r.every(c => c === '' || c == null)) continue;
      const fundName = (r[f.fundName] || '').toString().trim();
      if (!fundName) continue;

      const vintage = parseNum(r[f.vintage]);
      const commitment = parseNum(r[f.commitment]);
      // Some sheets record called capital as a negative outflow; normalize to positive.
      const called = Math.abs(parseNum(r[f.called]));
      const distributed = parseNum(r[f.distributed]);
      const nav = parseNum(r[f.nav]);

      // Skip empty rows (no financials, no vintage)
      if (commitment === 0 && called === 0 && distributed === 0 && nav === 0 && !(vintage > 1900)) continue;

      funds.push({
        fundName,
        firm: firmByFund[fundName] || '',
        entity: (r[f.entity] || '').toString().trim(),
        vintage: vintage > 1900 ? vintage : null,
        commitment,
        called,
        distributed,
        nav,
        irr: parseNumOrNull(r[f.irr]),
        tvpi: parseNumOrNull(r[f.tvpi]),
        dpi: parseNumOrNull(r[f.dpi]),
        pctFunded: parseNumOrNull(r[f.pctFunded]),
        totalValue: distributed + nav,
        unfunded: Math.max(0, commitment - called)
      });
    }

    // ── Transactions tab ─────────────────────────────────
    // Expected columns: Entity, Fund, Date, Type, Amount
    // "Type" is typically "Capital Call" or "Distribution".
    // Capital calls are usually negative (outflow), distributions positive.
    const txnRows = txnsRes.data.values || [];
    const tHeaders = txnRows[0] || [];
    const t = {
      entity: headerIdx(tHeaders, 'Entity'),
      fund: headerIdx(tHeaders, 'Fund'),
      date: headerIdx(tHeaders, 'Date'),
      type: headerIdx(tHeaders, 'Type'),
      amount: headerIdx(tHeaders, 'Amount')
    };

    const txns = [];
    for (let i = 1; i < txnRows.length; i++) {
      const r = txnRows[i];
      if (!r || !r[t.fund]) continue;
      const d = sheetSerialToDate(r[t.date]);
      txns.push({
        entity: (r[t.entity] || '').toString().trim(),
        fundName: (r[t.fund] || '').toString().trim(),
        date: isoDate(d),
        year: d ? d.getUTCFullYear() : null,
        type: (r[t.type] || '').toString().trim(),
        amount: parseNum(r[t.amount])
      });
    }

    dataCache = {
      funds, txns, firmByFund,
      lastFetch: Date.now(), loading: false, error: null
    };
    console.log(`Loaded ${funds.length} fund rows, ${txns.length} transactions, ${Object.keys(firmByFund).length} firm mappings`);
  } catch (err) {
    console.error('Error fetching sheet data:', err.message);
    dataCache.loading = false;
    dataCache.error = err.message;
  }
}

async function ensureData() {
  if (Date.now() - dataCache.lastFetch > CACHE_TTL || dataCache.funds.length === 0) {
    await fetchSheetData();
  }
}
fetchSheetData();
setInterval(() => fetchSheetData(), CACHE_TTL);

// ── Session + Passport ───────────────────────────────────
app.set('trust proxy', 1);
app.use(cookieSession({
  name: 'dashboard-session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-change-me'],
  maxAge: 180 * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax'
}));

app.use((req, res, next) => {
  if (req.session && !req.session.regenerate) req.session.regenerate = (cb) => cb();
  if (req.session && !req.session.save) req.session.save = (cb) => cb();
  next();
});

app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL || '/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    const email = (profile.emails?.[0]?.value || '').toLowerCase();
    if (!isAllowedEmail(email)) {
      return done(null, false, { message: 'Unauthorized user' });
    }
    return done(null, {
      id: profile.id,
      name: profile.displayName,
      email,
      photo: profile.photos?.[0]?.value
    });
  }
));

// ── Auth routes ──────────────────────────────────────────
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login-failed' }),
  (req, res) => res.redirect('/')
);
app.get('/auth/logout', (req, res) => { req.logout(() => res.redirect('/')); });

app.get('/login-failed', (req, res) => {
  const contact = SUPPORT_EMAIL
    ? `Contact ${SUPPORT_EMAIL} if you need access.`
    : 'Ask your administrator for access.';
  res.status(403).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Access Denied</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5;margin:0}.card{background:#fff;border-radius:12px;padding:48px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:400px}</style>
    </head><body><div class="card"><h1>Access Denied</h1><p>This dashboard is restricted to authorized users.<br>${contact}</p><a href="/">Try again</a></div></body></html>`);
});

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/google');
}

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  const allowedNote = ALLOWED_DOMAINS.length
    ? `Restricted to ${ALLOWED_DOMAINS.map(d => '@' + d).join(' and ')}`
    : 'Restricted to authorized users';
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${ORG_NAME} — Sign In</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5;margin:0}.card{background:#fff;border-radius:14px;padding:48px 56px;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.06)}h1{margin:0 0 6px}.sub{font-size:11px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:32px}.btn{display:inline-flex;align-items:center;gap:10px;background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px 28px;font-size:14px;font-weight:500;color:#333;text-decoration:none}.btn:hover{border-color:#0055AA;color:#0055AA}.btn img{width:20px;height:20px}.note{font-size:12px;color:#999;margin-top:20px}</style>
    </head><body><div class="card"><h1>${ORG_NAME}</h1><div class="sub">${ORG_TAGLINE}</div>
    <a href="/auth/google" class="btn"><img src="https://developers.google.com/identity/images/g-logo.png" alt="Google">Sign in with Google</a>
    <div class="note">${allowedNote}</div></div></body></html>`);
});

// ── API ──────────────────────────────────────────────────
app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

app.get('/api/config', requireAuth, (req, res) => {
  res.json({ orgName: ORG_NAME, orgTagline: ORG_TAGLINE });
});

app.get('/api/data', requireAuth, async (req, res) => {
  await ensureData();
  res.json({
    funds: dataCache.funds,
    txns: dataCache.txns,
    lastFetch: dataCache.lastFetch,
    error: dataCache.error
  });
});

app.get('/api/debug', requireAuth, async (req, res) => {
  await ensureData();
  const entityCounts = {};
  dataCache.funds.forEach(f => {
    const key = f.entity || '(empty)';
    entityCounts[key] = (entityCounts[key] || 0) + 1;
  });
  res.json({
    totalFunds: dataCache.funds.length,
    totalTxns: dataCache.txns.length,
    firmMappings: Object.keys(dataCache.firmByFund).length,
    fundsByEntity: entityCounts,
    lastFetch: new Date(dataCache.lastFetch).toISOString(),
    error: dataCache.error
  });
});

// ── Feedback (optional) ──────────────────────────────────
const FEEDBACK_SHEET_ID = process.env.FEEDBACK_SHEET_ID;
app.use(express.json());

app.post('/api/feedback', requireAuth, async (req, res) => {
  try {
    if (!FEEDBACK_SHEET_ID) return res.status(500).json({ error: 'Feedback sheet not configured' });
    const { name, type, comment, page } = req.body;
    if (!name || !comment) return res.status(400).json({ error: 'Name and comment required' });
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: FEEDBACK_SHEET_ID,
      range: 'Sheet1!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[new Date().toISOString(), name, req.user?.email || 'unknown', type || 'Other', page || '', comment]]
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Feedback error:', err.message);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

app.use('/static', requireAuth, express.static(path.join(__dirname, 'public')));
app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));
