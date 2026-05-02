# MQR Live Performance Dashboard

Live web dashboard for MQR (co-working spaces, Cairo) — pulls April 2026 leads from a Google Sheet and creative/insights data from the Meta Marketing API. Deployed on Vercel.

---

## Start here

The full build specification is in **[BRIEF.md](./BRIEF.md)**. Read it before writing any code.

That document is the source of truth — architecture, sections to build, sections to skip, data shapes, design system, implementation order, and acceptance criteria. If anything in this README conflicts with `BRIEF.md`, follow `BRIEF.md`.

---

## Quick orientation

```
mqr-dashboard/
├── BRIEF.md                 # ← Full build spec. Read first.
├── index.html               # Single-file frontend (HTML + CSS + JS + Chart.js)
├── api/
│   ├── sheet.js             # Vercel function: Google Sheet → JSON
│   └── meta.js              # Vercel function: Meta API → top creatives + arabic/english
├── lib/
│   ├── sheet-parser.js      # CSV → typed leads + KPI aggregations
│   ├── meta-client.js       # Meta API wrappers
│   └── join.js              # Inner-join Meta leads ↔ sheet rows on (form name + phone) OR (form name + email)
├── package.json
├── vercel.json
└── .env.example             # → copy to .env.local for local dev
```

---

## Local setup

```bash
# 1. Install
npm install

# 2. Configure secrets
cp .env.example .env.local
# Then fill in SHEET_CSV_URL, META_ACCESS_TOKEN, META_AD_ACCOUNT_ID

# 3. Run locally (requires Vercel CLI)
npm install -g vercel
npm run dev
# → opens at http://localhost:3000
```

---

## Deploy

```bash
# 1. Link the project to Vercel (first time only)
vercel link

# 2. Set production env vars
vercel env add SHEET_CSV_URL production
vercel env add META_ACCESS_TOKEN production
vercel env add META_AD_ACCOUNT_ID production

# 3. Push to prod
npm run deploy
```

---

## What this dashboard intentionally does NOT do (v1)

- No Sales Team / Reps section (agency-side dashboard — sales reps are out of scope)
- No TGC tab (MQR only for v1)
- No auto-refresh / cron (on-demand reload only)
- No Google Ads API integration (Google spend numbers come from the Sheet)
- No login / auth
- No PDF / image export

See `BRIEF.md` §11 for the full out-of-scope list.

---

## Open inputs Omar must provide before build

1. Confirmed column headers from the leads tab (and spend tab, if separate).
2. Published-to-web CSV URL → `SHEET_CSV_URL`.
3. Meta long-lived token → `META_ACCESS_TOKEN`.
4. Meta ad account ID → `META_AD_ACCOUNT_ID`.
5. Confirm campaign-naming convention for Arabic / English detection (case-insensitive substring rule by default).

See `BRIEF.md` §10 for details.
