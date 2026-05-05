// ─── Header normalization ──────────────────────────────────────────────────

const HEADER_MAP = {
  // ── Date ──────────────────────────────────────────────────────
  'date': 'date',
  'lead date': 'date',
  'date added': 'date',
  'submission date': 'date',
  'timestamp': 'date',
  'time stamp': 'date',
  'created at': 'date',

  // ── Channel source ─────────────────────────────────────────────
  // "Lead Source" is the main column: "Website", "Meta Form", "DM", etc.
  'source': 'source',
  'lead source': 'source',
  'channel': 'source',
  // "Referred From" tells us HOW they found the website, e.g. "Google"
  'referred from': 'referredFrom',
  'referral source': 'referredFrom',
  'referred by': 'referredFrom',
  'traffic source': 'referredFrom',

  // ── Identity ───────────────────────────────────────────────────
  'name': 'name',
  'full name': 'name',
  'client name': 'name',
  'company name': 'company',
  'company': 'company',
  'phone number': 'phone',
  'phone': 'phone',
  'mobile': 'phone',
  'mobile number': 'phone',
  'whatsapp url': 'whatsapp',
  'whatsapp': 'whatsapp',
  'email address': 'email',
  'email': 'email',
  'promo code': 'promoCode',

  // ── Inquiry ────────────────────────────────────────────────────
  'product inquiry': 'product',
  'product inquired': 'product',
  'product': 'product',
  'service': 'product',
  'location': 'location',
  'location inquired': 'location',
  'branch': 'location',
  'area': 'location',

  // ── CRM status ─────────────────────────────────────────────────
  'contacted by': 'contactedBy',
  'contact status': 'contactStatus',
  'contactstatus': 'contactStatus',
  'status': 'contactStatus',
  // Lead Quality / Relevant — "Relevant" or "Not Relevant"
  'lead quality': 'relevant',
  'relevant': 'relevant',
  'quality': 'relevant',
  'qualified': 'relevant',
  // Deal Stage
  'deal stage': 'dealStage',
  'dealstage': 'dealStage',
  'stage': 'dealStage',
  'deal status': 'dealStage',

  // ── Google Spend (manual daily entry by Omar) ──────────────────
  'google spend': 'googleSpend',
  'google_spend': 'googleSpend',
  'spend google': 'googleSpend',
  'googlespend': 'googleSpend',
  'google daily spend': 'googleSpend',
  'daily spend': 'googleSpend',
  'ad spend': 'googleSpend',

  // ── Ignored columns ────────────────────────────────────────────
  'comment (explain here) separate with /': 'comment',
  'comments': 'comment',
  'notes': 'comment',
  'comment': 'comment',
};

function normalizeHeaders(rawRecord) {
  const out = {};
  for (const [key, val] of Object.entries(rawRecord)) {
    const canonical = HEADER_MAP[key.trim().toLowerCase()];
    if (canonical) out[canonical] = val;
  }
  return out;
}

// ─── Field parsers ─────────────────────────────────────────────────────────

function parseDate(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // M/D/YYYY H:MM:SS  or  M/D/YYYY  (Google Sheets full-year timestamp)
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s[\s\S]*)?$/);
  if (m) {
    const month = m[1].padStart(2, '0');
    const day   = m[2].padStart(2, '0');
    return `${m[3]}-${month}-${day}`;
  }

  // MM/DD/YY H:MM AM/PM  (short year — treat YY 00–99 as 2000–2099)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s[\s\S]*)?$/);
  if (m) {
    const month = m[1].padStart(2, '0');
    const day   = m[2].padStart(2, '0');
    const year  = `20${m[3]}`;
    return `${year}-${month}-${day}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY (European style, no time)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

  // YYYY-MM-DD (already ISO)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  return null;
}

// Deal stage helpers — exact values from the MQR sheet
export function isDealClosed(stage)      { return /^deal closed$/i.test(stage || ''); }
export function isDealLost(stage)        { return /^deal lost$/i.test(stage || ''); }
export function isInDiscussions(stage)   { return /^in discussions?$/i.test(stage || ''); }
export function isTourMeeting(stage)     { return /^tour\s*[&+]\s*meeting$/i.test(stage || ''); }
export function isFutureSale(stage)      { return /^future sale$/i.test(stage || ''); }
export function isNotInterested(stage)   { return /^not interested$/i.test(stage || ''); }

// Lead Quality column — positive values from the MQR sheet
// Handles: "Relevant", "Yes", "Qualified", "Good", "Hot", "1", "true"
function parseRelevant(raw) {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === 'relevant' || v === 'yes' || v === 'qualified'
      || v === 'good' || v === 'hot' || v === '1' || v === 'true';
}

function parseGoogleSpend(raw) {
  if (!raw) return 0;
  const n = parseFloat(String(raw).replace(/[,\s£$]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ─── Main parse function (Google Sheets API 2D array) ─────────────────────

/**
 * rows[0] = header row (string[])
 * rows[1..] = data rows (string[])
 */
export function parseLeadsFromRows(rows) {
  if (!rows || rows.length < 2) {
    return { leads: [], errors: ['Sheet returned no data rows'], totalRows: 0 };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const errors = [];
  const leads = [];

  for (let i = 0; i < dataRows.length; i++) {
    const raw = {};
    headers.forEach((h, idx) => { raw[h] = dataRows[i][idx] ?? ''; });
    const row = normalizeHeaders(raw);

    const date = parseDate(row.date);

    if (!date) {
      if (row.date) errors.push(`Row ${i + 2}: unparseable date "${row.date}" — skipped`);
      continue;
    }

    leads.push({
      date,
      source: (row.source || '').trim() || null,
      referredFrom: (row.referredFrom || '').trim() || null,
      formName: (row.formName || '').trim() || null,
      name: (row.name || '').trim() || null,
      phone: (row.phone || '').trim() || null,
      email: (row.email || '').trim().toLowerCase() || null,
      location: (row.location || '').trim() || null,
      product: (row.product || '').trim() || null,
      contactStatus: (row.contactStatus || '').trim() || null,
      relevant: parseRelevant(row.relevant),
      dealStage: (row.dealStage || '').trim() || null,
      googleSpend: parseGoogleSpend(row.googleSpend),
    });
  }

  return { leads, errors, totalRows: dataRows.length };
}

// ─── Spend aggregation ─────────────────────────────────────────────────────

export function parseSpendFromLeads(leads) {
  const byDate = {};
  for (const lead of leads) {
    if (lead.googleSpend > 0) {
      byDate[lead.date] = (byDate[lead.date] || 0) + lead.googleSpend;
    }
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, google]) => ({ date, google, meta: null }));
}

// ─── KPI computation ───────────────────────────────────────────────────────

export function computeKPIs(leads, metaSpendTotal = 0) {
  const totalLeads = leads.length;
  const totalGoogleSpend = leads.reduce((s, l) => s + l.googleSpend, 0);
  const totalSpend = metaSpendTotal + totalGoogleSpend;

  const dealsClosed = leads.filter(l => isDealClosed(l.dealStage)).length;

  const metaLeads = leads.filter(l => /meta\s*form/i.test(l.source || ''));
  // Google leads = any lead referred from Google (Website leads via Google Ads)
  const googleLeads = leads.filter(l => /^google$/i.test(l.referredFrom || ''));
  const dmsLeads = leads.filter(l => /^dms?$/i.test(l.source || ''));

  return {
    totalLeads,
    totalMetaSpend: metaSpendTotal,
    totalGoogleSpend,
    totalSpend,
    blendedCPL: totalLeads > 0 ? totalSpend / totalLeads : 0,
    dealsClosed,
    costPerClosedDeal: dealsClosed > 0 ? totalSpend / dealsClosed : 0,
    metaCPL: metaLeads.length > 0 && metaSpendTotal > 0
      ? metaSpendTotal / metaLeads.length : 0,
    googleCPL: googleLeads.length > 0 && totalGoogleSpend > 0
      ? totalGoogleSpend / googleLeads.length : 0,
    dmsCPL: 0,
    metaLeadsCount: metaLeads.length,
    googleLeadsCount: googleLeads.length,
    dmsLeadsCount: dmsLeads.length,
  };
}

// ─── Funnel ────────────────────────────────────────────────────────────────

export function computeFunnel(leads) {
  const total = leads.length;
  if (total === 0) return [];

  const pct = (n) => Math.round((n / total) * 100);

  const contacted = leads.filter(l => {
    const s = (l.contactStatus || '').toLowerCase();
    return s && s !== '' && !/^(not contacted|pending|unknown)$/i.test(s);
  }).length;

  const replied = leads.filter(l =>
    /replied|reply/i.test(l.contactStatus || '')
  ).length;

  const relevant = leads.filter(l => l.relevant === true).length;

  const inDiscussions = leads.filter(l => isInDiscussions(l.dealStage)).length;
  const tourQuote     = leads.filter(l => isTourMeeting(l.dealStage)).length;
  const closed        = leads.filter(l => isDealClosed(l.dealStage)).length;

  return [
    { label: 'Total Leads',      count: total,         pct: 100 },
    { label: 'Contacted',        count: contacted,     pct: pct(contacted) },
    { label: 'Replied',          count: replied,       pct: pct(replied) },
    { label: 'Marked Relevant',  count: relevant,      pct: pct(relevant) },
    { label: 'In Discussions',   count: inDiscussions, pct: pct(inDiscussions) },
    { label: 'Tour / Quotation', count: tourQuote,     pct: pct(tourQuote) },
    { label: 'Deal Closed',      count: closed,        pct: pct(closed) },
  ];
}

// ─── Location stats ────────────────────────────────────────────────────────

export function computeLocationStats(leads) {
  const map = {};
  for (const l of leads) {
    const loc = l.location || 'Unknown';
    if (!map[loc]) map[loc] = {
      location: loc, total: 0, closed: 0,
      inDiscussions: 0, tourQuote: 0, lost: 0,
      futureSale: 0, notInterested: 0, quoteSent: 0,
    };
    map[loc].total++;
    const s = l.dealStage;
    if (isDealClosed(s))    map[loc].closed++;
    else if (isInDiscussions(s)) map[loc].inDiscussions++;
    else if (isTourMeeting(s))   map[loc].tourQuote++;
    else if (isDealLost(s))      map[loc].lost++;
    else if (isFutureSale(s))    map[loc].futureSale++;
    else if (isNotInterested(s)) map[loc].notInterested++;
  }
  return Object.values(map)
    .sort((a, b) => b.total - a.total)
    .map(r => ({ ...r, closeRate: r.total > 0 ? Math.round((r.closed / r.total) * 100) : 0 }));
}

// ─── Product stats ─────────────────────────────────────────────────────────

export function computeProductStats(leads) {
  const map = {};
  for (const l of leads) {
    const p = l.product || 'Unknown';
    if (!map[p]) map[p] = { product: p, total: 0, closed: 0 };
    map[p].total++;
    if (isDealClosed(l.dealStage)) map[p].closed++;
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

// ─── Source matrix ─────────────────────────────────────────────────────────

export function computeSourceMatrix(leads) {
  const map = {};
  for (const l of leads) {
    const src = l.source || 'Unknown';
    if (!map[src]) map[src] = { source: src, leads: 0, replied: 0, relevant: 0, closed: 0, googleSpend: 0 };
    map[src].leads++;
    if (/replied|reply/i.test(l.contactStatus || '')) map[src].replied++;
    if (l.relevant) map[src].relevant++;
    if (isDealClosed(l.dealStage)) map[src].closed++;
    map[src].googleSpend += l.googleSpend;
  }
  return Object.values(map)
    .sort((a, b) => b.leads - a.leads)
    .map(r => ({
      ...r,
      replyPct:    r.leads > 0 ? Math.round((r.replied  / r.leads) * 100) : 0,
      relevantPct: r.leads > 0 ? Math.round((r.relevant / r.leads) * 100) : 0,
      closePct:    r.leads > 0 ? Math.round((r.closed   / r.leads) * 100) : 0,
    }));
}

// ─── Daily leads by channel ────────────────────────────────────────────────

export function computeDailyLeads(leads) {
  const map = {};
  for (const l of leads) {
    if (!map[l.date]) map[l.date] = { date: l.date, meta: 0, google: 0, dms: 0, other: 0 };
    if (/meta\s*form/i.test(l.source || ''))          map[l.date].meta++;
    else if (/^google$/i.test(l.referredFrom || ''))  map[l.date].google++;
    else if (/^dms?$/i.test(l.source || ''))          map[l.date].dms++;
    else map[l.date].other++;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Deal stage distribution ───────────────────────────────────────────────

export function computeDealStages(leads) {
  const map = {};
  for (const l of leads) {
    const stage = l.dealStage || 'Unqualified';
    map[stage] = (map[stage] || 0) + 1;
  }
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .map(([stage, count]) => ({ stage, count }));
}

// ─── Contact status breakdown ──────────────────────────────────────────────

export function computeContactStatus(leads) {
  const map = {};
  for (const l of leads) {
    const status = l.contactStatus || 'Unknown';
    map[status] = (map[status] || 0) + 1;
  }
  return Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .map(([status, count]) => ({ status, count }));
}
