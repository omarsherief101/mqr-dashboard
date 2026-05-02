# MQR Live Performance Dashboard — Build Brief for Claude Code (Sonnet 4.6)

**Owner:** Omar (senior performance marketer, agency-side)
**Client:** MQR (co-working spaces, Cairo)
**Scope:** April 2026 only (one-month exercise)
**Reference (visual concept, NOT to copy aesthetically):** Khaled's manual weekly dashboard (HTML reference shared by Omar)

---

## 1. What we are building

A live, web-hosted, single-page performance dashboard for MQR April 2026 leads that:

1. **Mirrors every data section + visualization concept** from Khaled's reference, **except the Sales Team / Reps section** (the agency runs ads, not sales).
2. Pulls lead data **live from a Google Sheet** every time the user reloads.
3. Pulls Meta Marketing API data for **two new modules Khaled does not have**:
   - **Top 3 Creatives** card (best ads from April lead/instant-form campaigns) with reasons + recommendations.
   - **Arabic vs English creative comparison** — two visualizations comparing leads generated, qualified, and relevant from Arabic-language campaigns vs English-language campaigns. Differentiation rule: campaign or ad-set name **contains "arabic"** → Arabic; **contains "english"** → English. Forms inherit their parent campaign/ad-set's language.
4. Looks **visibly more sophisticated than Khaled's reference** — different color system, different typography stack, different layout density. Same data structure, different design DNA.

The dashboard will be **deployed to Vercel** as a static site + serverless functions. Refresh model is **on-demand reload only** (no cron, no auto-poll).

---

## 2. Tech stack

- **Frontend:** Single static `index.html` + vanilla JS + Chart.js (CDN). No React, no build step. Keep it dependency-light.
- **Backend:** Two Vercel serverless functions in `/api`:
  - `api/sheet.js` — fetches the Google Sheet via published-CSV URL, parses to JSON, returns.
  - `api/meta.js` — calls Meta Marketing API with the long-lived token, computes top creatives + Arabic/English split, returns JSON.
- **Hosting:** Vercel (free tier).
- **Secrets:** `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `SHEET_CSV_URL` as Vercel env vars.
- **Caching:** Each `/api/*` response cached server-side for 5 minutes to avoid hammering Meta on rapid reloads.

---

## 3. File structure

```
mqr-dashboard/
├── index.html               # Single-file frontend: HTML + CSS + JS + Chart.js init
├── api/
│   ├── sheet.js             # Vercel serverless: fetch Sheets CSV → JSON
│   └── meta.js              # Vercel serverless: Meta API → top creatives + arabic/english JSON
├── lib/
│   ├── sheet-parser.js      # Pure functions: CSV → typed lead rows + KPI aggregations
│   ├── meta-client.js       # Pure functions: Meta API wrappers (campaigns, ads, creatives, leads)
│   └── join.js              # Inner-join Meta leads ↔ sheet rows on (form name + phone) OR (form name + email)
├── public/
│   └── (any static assets — fonts already loaded from Google Fonts CDN)
├── package.json             # node-fetch, csv-parse only
├── vercel.json              # routes + function config
└── .env.example             # template — DO NOT commit real values
```

---

## 4. Data sources

### 4a. Google Sheet (live, source-of-truth for everything except Meta-only modules)

**Source URL (provided by Omar):**
`https://docs.google.com/spreadsheets/d/1ZWfVOj7qg23CVAdJm5ARwsbElH_XNP_1gxqRxP8tiY4/edit?usp=sharing`

**Action required from Omar before build starts (see §10):** publish the relevant tab(s) to web as CSV, paste the CSV link into `SHEET_CSV_URL` env var.

**Expected sheet columns (Omar to confirm exact names — see §10):**
- Date / Lead Date
- Source (values: Meta Form, Website, DMs, etc.)
- Form Name (Meta lead-form name, where applicable — used as join key)
- Phone (used as join key with Meta)
- Email (used as join key with Meta)
- Location Inquired
- Product Inquired
- Contact Status (Contacted / Replied / Attempt 1 / 2 / 3 / Unreachable / etc.)
- Relevant (Yes/No or similar boolean)
- Deal Stage (Unqualified / In Discussions / Tour or Quotation / Quote Sent / Closed / Future Sale / Lost / Not Interested)
- Daily Spend Google (if in same sheet) OR separate spend tab
- Daily Spend Meta (if in same sheet) OR separate spend tab

**The brief assumes one main "Leads" tab + a second "Spend" tab** with daily Google/Meta spend. Adjust parser based on what Omar shares.

### 4b. Meta Marketing API

**Auth:** `META_ACCESS_TOKEN` env var (long-lived system user token, already provisioned).
**Account:** `META_AD_ACCOUNT_ID` env var (format: `act_XXXXXXXXX`).
**API version:** Use the latest stable Graph API version (currently v21.0+ as of April 2026).

**Calls needed:**
1. `GET /{ad_account_id}/campaigns` — fetch all campaigns with `objective=OUTCOME_LEADS` (or legacy `LEAD_GENERATION`). Filter by date_preset or time_range covering April 2026 only.
2. `GET /{ad_account_id}/ads` — fetch all ads under those campaigns; include fields: `id`, `name`, `adset_id`, `adset_name`, `campaign_id`, `campaign_name`, `creative{id,name,thumbnail_url,object_story_spec,asset_feed_spec}`, `effective_status`.
3. `GET /{ad_id}/insights` — for each ad, get `actions` (filter `action_type=lead`), `spend`, `impressions`, `ctr`, `cpm` for time_range = April 2026.
4. `GET /{form_id}/leads` (or `/{ad_id}/leads`) — pull individual lead records with `field_data` (phone, email, full name) for April 2026, used for the join.

**Rate-limit guard:** batch where possible (`?fields=...,ads{...,insights{...}}` nested), respect 200/hr business-tier limit, and cache the entire `/api/meta` response for 5 min.

---

## 5. Frontend specification

### 5a. Sections to build (mirror Khaled, EXCLUDE Sales Team)

Build a **single-tab MQR view** (no TGC tab unless Omar requests later — confirm before building TGC). Sections, in order:

1. **Header** — title "MQR Performance · April 2026", eyebrow label, subtitle, last-updated timestamp + Reload button (top right).

2. **KPI Strip (4 cards):**
   - Total Leads (April)
   - Blended CPL (total spend ÷ total leads)
   - Deals Closed
   - Cost per Closed Deal

3. **Channel CPL Sub-strip (3 cards):** Meta CPL · Google CPL · DMs CPL (DMs always £0 — organic).

4. **Headline Insight Banner** — dynamic: compute the biggest cross-channel cost-per-deal disparity (e.g. "Website converts Nx better than Meta Form") and render in a colored banner. Must be data-driven, not hardcoded.

5. **Section 01 — Volume & Source**
   - Daily Leads by Attribution Channel (stacked bar, days × Meta/Google/DMs)
   - Lead Source Mix (donut, %)
   - Source Quality & Cost Matrix (table: Source · Leads · Reply % · Relevant % · Closed · Close % · Spend · Cost/Close)

6. **Section 02 — Media Spend Deep Dive**
   - Channel Efficiency & ROI (grouped bar: CPL vs Cost/Close, Google vs Meta)
   - Daily CPL by Channel (line, log scale)
   - Weekly Spend Comparison (bar chart + week-by-week table)
   - Cumulative Spend Build-Up (cumulative line)
   - Daily Spend & Lead Detail (full 30-day table, sticky header + footer total)

7. **Section 03 — The Funnel**
   - Lead → Deal Conversion Funnel (Total Leads → Contacted → Replied → Marked Relevant → In Discussions → Tour/Quotation → Deal Closed). Each step shows count + %.
   - Deal Stage Distribution (donut or horizontal bar — Unqualified / In Discussions / Lost / Closed / Future Sale / Tour-Quote)
   - Contact Status Breakdown (horizontal bars)

8. **Section 04 — Demand by Location & Product**
   - Top Locations by Demand (horizontal bar list, all April locations)
   - Product Inquiry Mix (horizontal bar list)
   - Closed Deals by Location (sage card variant)
   - Closed Deals by Product
   - Location Detailed Lead Status (full table: Location · Total · In Discussions · Tour & Meeting · Quote Sent · Closed · Lost · Future Sale · Not Interested · Close Rate)

9. **EXCLUDED:** Section 05 — Sales Team Performance. **Do not build this section.**

10. **Section 05 (renumbered) — Top 3 Creatives [META API]**
    - Card with 3 creative blocks side-by-side (or stacked on mobile).
    - Each block: thumbnail/image, ad name, parent campaign name, leads generated (April), CPL, "why it's the best" (auto-reasoning based on lowest CPL × highest lead volume × highest qualified-lead rate from sheet join), "create more like this" recommendation (1–2 sentences referencing the angle/format).
    - Ranking logic: composite score = `(qualified_leads_from_sheet_join / total_leads_from_meta) × log(total_leads_from_meta) − normalized_cpl`. Tunable weights in `lib/meta-client.js`.

11. **Section 06 — Arabic vs English Creative Comparison [META API]**
    - **Chart 1:** Grouped bar chart, X-axis = `[Total Leads, Qualified, Relevant, Closed]`, two series = Arabic / English.
    - **Chart 2:** Side-by-side donuts OR a 2×4 metric grid with KPI tiles for each language: Lead count, Qualified count, Qualified %, Relevant count, Relevant %, Closed count, Close rate %, Avg CPL.
    - Below the charts: a short data-driven verdict line (e.g. "Arabic creatives outperform English on qualified-rate by Nx" — computed at render time).
    - Differentiation rule (DO NOT change this): every Meta lead is labeled **Arabic** if its parent campaign OR ad-set name contains the substring `arabic` (case-insensitive); **English** if it contains `english`; **Other** otherwise (excluded from this comparison only — still counted everywhere else).

12. **Action Plan section (optional, recommended)** — 4 to 6 cards with prioritized recommendations. Can be data-driven or templated. Defer until §11 is working; Omar will review then decide.

### 5b. Visual design system (deliberately different from Khaled's beige/sage editorial)

**Recommended direction: dark-mode performance-terminal aesthetic — the bar is "Linear meets Stripe Sigma meets Vercel Analytics."** This dashboard exists to demonstrate that the agency is more sophisticated on data tooling than the client. Aim for product-grade polish, not a deck. Override only if Omar requests differently.

```css
:root {
  /* Surfaces */
  --bg:        #0a0e16;       /* page background, deep navy-black */
  --surface:   #131a28;       /* card */
  --surface-2: #1a2236;       /* elevated card / hover */
  --border:    #243049;
  --border-2:  #2f3d5c;

  /* Text */
  --text:      #e8edf7;
  --text-2:    #9aa4ba;
  --text-3:    #5c6781;

  /* Accents — bright, modern, performance-marketer */
  --primary:   #00d4a4;       /* electric mint — wins / good */
  --danger:    #ff5e51;       /* coral — bad / alerts */
  --warn:      #ffb84d;       /* amber — caution */
  --info:      #5b9eff;       /* electric blue — neutral data */
  --accent:    #c084fc;       /* violet — secondary highlights / Meta */
  --google:    #4ad0a0;       /* slightly desaturated mint — Google */
  --meta:      #c084fc;       /* violet — Meta */
  --dms:       #5b9eff;       /* blue — DMs */
}
```

**Typography:**
- Headings + numbers: **`Space Grotesk`** (Google Fonts) — geometric, modern, sharper than Khaled's Plus Jakarta.
- Body: **`Inter`**.
- Numeric tabular figures: `font-variant-numeric: tabular-nums;` everywhere numbers are stacked.
- KPI digits: 44–56px, weight 700, letter-spacing −2px.

**Layout density:** denser than Khaled. Use a 12-column grid at max-width 1400px. KPI strip = 4 columns wide, charts can span 8 columns next to a 4-column commentary card. Card radius 14px, 1px borders, subtle drop-shadow `0 1px 0 rgba(255,255,255,0.04) inset`.

**Charts:** Chart.js, dark theme (`color: var(--text)`, `grid.color: var(--border)`). Use the accent palette above for series colors. Tooltips with monospace numbers.

**Reload affordance:** top-right pill button, "↻ Refresh data · last synced 2 min ago", click → re-fires both `/api/sheet` and `/api/meta`, shows skeleton loaders on cards during fetch.

---

## 6. Backend specification

### 6a. `api/sheet.js`

```
GET /api/sheet
→ 200 OK
{
  asOf: "2026-04-30T08:00:00Z",
  leads: [
    {
      date: "2026-04-15",
      source: "Meta Form" | "Website" | "DMs",
      formName: "MQR_Offices_Apr_Arabic_v3" | null,
      phone: "+201234567890",
      email: "x@y.com",
      location: "New Cairo - Cairo Business Park",
      product: "Offices",
      contactStatus: "Replied" | "Attempt 1" | ...,
      relevant: true | false,
      dealStage: "In Discussions" | "Closed" | ...,
    }, ...
  ],
  spend: [
    { date: "2026-04-01", google: 1234.56, meta: 2345.67 }, ...
  ],
  meta: { totalRows: 981, parsedRows: 981, errors: [] }
}
```

- Fetch `process.env.SHEET_CSV_URL` with `node-fetch`.
- Parse with `csv-parse/sync`.
- Filter rows to April 2026 only.
- Normalize column names (case-insensitive header matching).
- Cache response in module-scope `Map` for 5 minutes; if cache hit, return immediately.
- Return 502 with diagnostic JSON if fetch fails (do not crash).

### 6b. `api/meta.js`

```
GET /api/meta
→ 200 OK
{
  asOf: "2026-04-30T08:00:00Z",
  topCreatives: [
    {
      adId: "23847...",
      adName: "MQR_Offices_Apr_Arabic_v3",
      campaignName: "MQR_Leads_April_Arabic",
      thumbnailUrl: "https://...",
      leads: 142,
      qualifiedLeads: 78,         // joined from sheet
      relevantLeads: 51,          // joined from sheet
      closedDeals: 4,             // joined from sheet
      cpl: 87.40,
      compositeScore: 3.41,
      reasons: [
        "Lowest CPL among lead-form ads (£87 vs avg £143)",
        "55% qualified rate vs 32% account average",
        "Drove 4 closed deals — 12% of April total"
      ],
      recommendation: "Replicate the Arabic, casual-tone, single-image angle — produce 3–4 variants swapping the location callout."
    }, ...x3
  ],
  languageSplit: {
    arabic:  { totalLeads: 412, qualified: 198, relevant: 134, closed: 9, avgCpl: 102.3 },
    english: { totalLeads: 264, qualified:  88, relevant:  53, closed: 2, avgCpl: 195.7 },
    other:   { totalLeads:   0, qualified:   0, relevant:   0, closed: 0, avgCpl:   0   }
  },
  diagnostics: { unmatchedMetaLeads: 18, unmatchedReason: "phone normalization failed" }
}
```

- Pull all April lead-objective campaigns → all ads → all insights → all form leads. See §4b.
- For each Meta lead, normalize phone (E.164, strip spaces/dashes/leading zeros, prepend +20 if Egyptian) and lowercase email.
- For each sheet lead, normalize phone + email the same way.
- Build a `Map` keyed by `${formName}|${phone}` and a fallback `${formName}|${email}`.
- For each Meta lead, look up the sheet record → enrich with `relevant`, `dealStage`. If no match, count it in `diagnostics.unmatchedMetaLeads` but still include in `totalLeads`.
- Group by ad → compute leads, qualified (`relevant === true`), closed (`dealStage === "Closed"`), CPL.
- Top 3 creatives = top 3 ads by `compositeScore` (defined in §5a #11).
- Language split: classify each ad by `arabic|english|other` based on `campaign_name` first, then `adset_name` if campaign has neither keyword. Sum per-ad counts into the three buckets.
- Cache response 5 min.
- Return 502 with diagnostic JSON on Meta API failures.

### 6c. `vercel.json`

Standard `functions` block, 10s timeout per function (Meta calls can be slow). Deploy with `vercel --prod`.

---

## 7. Implementation order (suggested for Sonnet 4.6)

1. **Scaffold** — `package.json`, `vercel.json`, env example, README. Dependencies: `node-fetch@3`, `csv-parse`.
2. **`api/sheet.js`** — get the sheet flowing first. Test with a `/api/sheet` curl. Hardcode the CSV URL in dev, env-var it for deploy.
3. **Sheet parser unit pass** — confirm KPI math (total leads, blended CPL, funnel counts) matches Khaled's reference numbers within ±1% as a sanity check.
4. **`index.html` skeleton + KPI strip + Section 01 (Volume & Source)** — wire to `/api/sheet`, render KPIs and the first 3 visualizations. Visual system applied.
5. **Sections 02 → 04** in sequence.
6. **`api/meta.js`** — implement campaign → ads → insights → leads pipeline. Test with curl. Verify the join (count matched vs unmatched).
7. **Section 05 — Top 3 Creatives** — render from `/api/meta`.
8. **Section 06 — Arabic vs English** — render from `/api/meta`.
9. **Reload UX, last-synced timestamp, skeleton loaders, error states.**
10. **Deploy to Vercel** with env vars set.
11. **QA pass** — open in mobile + desktop, check tabular alignment, check chart legibility on dark mode.

---

## 8. Acceptance criteria

- `/` loads in <2s on a warm cache, <6s cold.
- All sections from Khaled's reference are present **except** Sales Team — verified visually by Omar.
- KPI numbers match Khaled's April reference within ±1% (allowing for live sheet edits since his snapshot).
- Top 3 Creatives card renders 3 ads with thumbnail + reasons + recommendation.
- Arabic vs English section shows 2 charts/visualizations with non-zero data in both buckets.
- Reload button visibly refetches both endpoints, with a "last synced" timestamp updating.
- Page is responsive at 1440px desktop and 390px mobile.
- All chart colors come from CSS variables in §5b (no inline hex codes outside `:root`).

---

## 9. Visual differentiation checklist (vs Khaled)

Sonnet 4.6 must NOT replicate any of these from the reference:
- Beige `#f4ede3` background — we use `--bg: #0a0e16` dark
- Sage `#96a480` primary — we use `--primary: #00d4a4` electric mint
- Plus Jakarta Sans / DM Sans — we use Space Grotesk + Inter
- Dotted line decorations under headers — we use solid 1px gradient bars or no underline
- Editorial section numbers ("01 / Volume & Source" with serif feel) — we use small monospace section labels (e.g. `[ S01 · VOLUME ]`)
- "+" brand mark fixed top-left — drop it, replace with a Reload pill top-right
- Sage banner cards with dark stripe — replace with surface-2 cards with primary-color left border

This is non-negotiable: visual differentiation is the political point of the project.

---

## 10. Open items Omar must provide before/during build

1. **Confirm Google Sheet column headers.** Paste the header row of the leads tab and the spend tab so the parser can be wired exactly. Confirm whether spend lives in the same tab or a separate one.
2. **Publish the leads tab (and spend tab) to web as CSV.** File → Share → Publish to web → select tab → CSV. Paste the resulting URL — that goes into `SHEET_CSV_URL`.
3. **Provide `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID`.** Set as Vercel env vars. Never paste in chat or commit to git.
4. **Confirm campaign-naming convention.** Are "arabic" / "english" always lowercase substrings, or do we also need to match `Arabic`, `AR`, `EN`? Default rule = case-insensitive substring; broaden if Omar has variants.
5. **Decide on Action Plan section** — keep it (templated) or skip for v1.
6. **TGC tab** — skip for v1 (build MQR only first), add later if requested.

---

## 11. What NOT to build in v1

- Sales Team / Reps performance section.
- TGC tab.
- Auth / login on the dashboard.
- Auto-refresh / cron jobs.
- Google Ads API integration (Omar has decided this is out-of-scope; spend numbers come from the sheet).
- PDF / image export.
- Historical month comparison (April only).

---

## 12. Notes for the executing agent

- Treat the reference HTML as a **structural map only** — do not copy any of its CSS, color hex codes, fonts, or wording verbatim.
- Numbers shown in the reference (981 leads, £156K spend, etc.) are illustrative. Trust whatever the live sheet returns at build time.
- If an API call fails, render the affected section in an "error state" with a retry button — do not crash the whole page.
- All time math is in Africa/Cairo timezone.
- Currency is EGP; render with the £ symbol prefix as in the reference (Egyptian pound is locally written as £ in agency-side dashboards).
- When in doubt about scope, ship the smallest version that satisfies the acceptance criteria in §8 and ask Omar before adding more.

---

## 13. Premium polish — the jaw-drop factor (NON-NEGOTIABLE)

This dashboard exists for a political reason: the client manager has publicly told the agency they are "outdated on AI and dashboards." The frontend has to **end that conversation** the second he opens the link. That means product-grade polish, not deck-grade. Every item in this section is a hard requirement, not a nice-to-have.

### 13a. Hero / header treatment

- **Live status pill** in the top-right corner: small green dot with a slow pulse animation, label `LIVE · synced 14s ago`. The "14s ago" must be a real, live-counting timestamp that updates every second. On reload it briefly says `syncing…` with a spinning glyph, then snaps back to `synced just now` and resumes counting.
- **Hero headline** at 64–80px, weight 700, tight letter-spacing (-2.5px). Pair with a 12px monospace eyebrow line above it (`MQR · APRIL 2026 · LEAD PERFORMANCE`).
- **Animated mesh-gradient background** behind the hero band only — extremely subtle, slow-moving (60s loop), low opacity (≤0.15). Pure CSS conic/radial gradients with `animation: drift 60s linear infinite`. Must respect `prefers-reduced-motion`.
- **First-load reveal:** the hero KPI digits count up from 0 to their real value over ~1000ms with a smooth ease-out cubic. Cards stagger-fade in left-to-right (50ms delay per card). One-time only — no animation on subsequent reloads of the same data.

### 13b. KPI cards

- Each KPI card includes a **mini sparkline** showing the last 30 days of that metric (drawn with Chart.js or inline SVG). 36px tall, no axes, gradient fill under the line.
- A **delta chip** in the top-right of each card: `▲ +12% vs Mar` in mint, or `▼ -8% vs Mar` in coral. Where prior-month data isn't available, render a placeholder dash.
- **Hover:** card lifts 4px (transform), shadow grows from `0 1px 2px` to `0 12px 32px rgba(0,212,164,0.08)`, border accent color brightens. Transition `220ms cubic-bezier(0.16, 1, 0.3, 1)`.
- KPI numbers use **tabular-nums + a custom monospaced numeric face** (e.g. `JetBrains Mono` for the digits, Space Grotesk for any unit suffix like £ or %).

### 13c. Charts (this is where Khaled's manual deck cannot compete)

- **Entrance animation:** bars rise from baseline, lines draw left-to-right (stroke-dashoffset technique), donuts rotate-in 90° to 360° while opacity fades 0→1. ~700ms, ease-out.
- **Gradient fills** instead of flat fills on every series. Bars and area charts use vertical linear gradients from `accent` at top to `accent / 20% alpha` at bottom. Lines use a soft glow effect (`filter: drop-shadow(0 0 8px rgba(0,212,164,0.35))` on the active line).
- **Crosshair tooltips** on time-series: vertical line snaps to nearest x-point on hover, tooltip card has `backdrop-filter: blur(12px)` over a semi-transparent dark surface, with a tiny color dot per series and tabular numbers. Tooltip animates in (translate + fade) over 120ms.
- **Legend chips** are pill-shaped, click-to-toggle, with smooth opacity transition on the corresponding chart series when toggled.
- For the donut "Lead Source Mix": **active slice pulls out 8px** on hover with a smooth easing, and the center of the donut shows the hovered series' label + count + % (live-updating).

### 13d. Section reveals + sticky nav

- Add a **sticky top sub-nav** that appears once the user scrolls past the hero. It contains compact section labels — `[ S01 · ACQUISITION ] [ S02 · SPEND ] [ S03 · FUNNEL ] [ S04 · DEMAND ] [ S05 · CREATIVES ] [ S06 · LANGUAGE ]` — with the currently-visible section highlighted (mint underline + brighter text). Click → smooth-scroll to section. Use IntersectionObserver for active-section tracking.
- Each section header has a **draw-on-scroll-in underline:** thin gradient bar that animates `width: 0 → 100%` when the section enters the viewport, ~600ms.
- Section number badges (`S01`, `S02` …) styled as small monospace pills with the mint accent color, NOT large editorial serif numerals like Khaled's reference.

### 13e. Insight & Action Plan cards

- Each insight card has a **custom inline SVG icon** (16–20px) on the left edge — no emoji. Icon is keyed to severity: lightning bolt for "this week / urgent," upward arrow for "compounding," diagonal arrow for "next 30 days."
- Severity strip on the left edge of the card uses a **vertical gradient** (e.g. coral → dark coral) instead of a flat color bar.
- **Hover:** card lifts subtly, the severity strip glows.
- Animated `▸` arrow on the right edge that gently nudges right on hover (10px translate, 220ms ease).

### 13f. Top 3 Creatives card (this section is the showpiece)

- Three creative blocks side-by-side at desktop, stacked on mobile.
- Each block has a **rank badge** in the top-left: `01`, `02`, `03` rendered as a 32px monospace numeral inside a mint pill with `box-shadow: 0 0 0 1px rgba(0,212,164,0.4), 0 0 24px rgba(0,212,164,0.15)`.
- Creative thumbnail is shown inside an aspect-ratio-locked frame (1:1), with a subtle 1px border and a hover treatment that **scales the image to 1.04** with a soft inner shadow appearing.
- Below the image: ad name in 16px Space Grotesk weight 700, campaign name in 11px monospace below it.
- Metrics row: three stat tiles (`Leads`, `CPL`, `Qualified %`) in a horizontal grid, each with a 24px number and a 9px uppercase label.
- "Why it's the best" — three reasons rendered as small chips with a subtle background, one per line.
- "Create like this →" CTA at the bottom, the arrow translating right on hover.

### 13g. Arabic vs English section (the second showpiece)

- Treat this as a **versus / battle layout**: two equal-width columns, Arabic on one side and English on the other, with a thin vertical mint divider that has a tiny "VS" badge centered on it.
- Each side has its language label as an oversized vertical or horizontal title (e.g. `ARABIC →` left side, `← ENGLISH` right side, in 32px Space Grotesk).
- Below the labels: a vertical stack of metric tiles (Total Leads, Qualified, Qualified %, Relevant %, Closed, CPL).
- **Counter race** on first load: both sides count up simultaneously over ~1200ms — visually highlighting which side "wins" each metric.
- Below the dual columns, a **verdict ribbon**: a single full-width card with a mint-colored ribbon corner saying "VERDICT" and a one-line data-driven sentence (e.g. "Arabic creatives outperform English by 1.6× on qualified rate at 47% lower CPL").
- The grouped bar chart from §5a #11 lives below the dual-column visual layout — DO NOT replace the dual-column layout with the chart. Render both.

### 13h. Reload UX

- Reload button is a pill in the top-right with a refresh glyph and the live-counting "synced Xs ago" label.
- On click: glyph spins continuously, all data-bearing surfaces show **shimmer skeletons** that exactly match the final shape (KPI cards become 4 mint-tinted rectangles, charts become rectangles with sweeping gradient shimmer). Skeletons animate with a subtle horizontal gradient sweep (~1.5s loop).
- On success: a tiny mint dot pulses next to the synced label, label snaps to `synced just now`, and the data fades from skeleton to real values in 200ms.
- On error: skeleton dissolves, an inline error card appears in-place with a retry button. Error messages must be human-readable, not raw stack traces.

### 13i. Tables

- Sticky headers with `backdrop-filter: blur(12px)`, semi-transparent dark surface.
- Hover row highlight: row background transitions to `--surface-2` over 140ms.
- Sorted column header has a chevron + accent color; sort transitions are smooth (rows reorder with a 200ms slide).
- Optional: row click → slide-in detail panel from the right side (skip for v1 if time-pressed; mark as v2).

### 13j. Empty + error states

- No generic "Loading…" or "Error." copy. Empty state for any chart with no data renders a small custom illustration (inline SVG, monoline style, `--text-3` color) with a one-liner like `No leads on this day yet · check back after 9pm Cairo`.
- Errors render in-card, with a retry button styled to match the design system (pill, mint border, ghost background).

### 13k. Microinteractions library (apply globally)

- Every interactive element has a hover state. No bare buttons.
- Every transition uses one of three easing curves: `cubic-bezier(0.16, 1, 0.3, 1)` for spring/overshoot, `cubic-bezier(0.4, 0, 0.2, 1)` for material, `linear` for indeterminate animations only.
- Buttons have a subtle press state (transform: scale(0.98) for 80ms).
- Click ripple is optional but encouraged on primary CTAs.
- All transitions respect `@media (prefers-reduced-motion: reduce)` — collapse to opacity-only or no animation.

### 13l. Keyboard shortcuts (signature touch)

- `R` → reload data
- `1`–`6` → jump to corresponding section
- `?` → toast that lists shortcuts (auto-dismisses after 4s)

This is exactly the kind of detail Khaled cannot ship in an Excel-exported deck.

### 13m. Footer / signature

- Discreet footer line: `BUILT BY [AGENCY NAME] · LIVE DATA · APRIL 2026` in 11px monospace, `--text-3` color. Adds product-grade legitimacy.
- Tiny version chip in the bottom-right corner (`v0.1`).

---

## 14. Performance budget

- Initial paint <1.5s on a 3G-emulated connection (yes, this matters — Khaled may open it on his phone).
- Largest Contentful Paint <2.5s.
- Total JS payload (excluding Chart.js CDN) <80KB.
- No layout shift after first paint (CLS = 0).
- Charts only animate once per session unless data changes.

If the polish work in §13 forces a perf regression below these budgets, the polish wins for v1 — but document the trade-offs in a `PERF_NOTES.md` file.
