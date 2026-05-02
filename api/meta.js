import {
  fetchCampaigns,
  fetchAdsWithInsights,
  classifyLanguage,
  compositeScore,
  extractLeadCount,
  extractSpend,
  normalizePhone,
  normalizeEmail,
  token,
  accountId,
  graphGetAll,
} from '../lib/meta-client.js';
import { requireAuth } from '../lib/auth.js';

// Per-range cache: key = "YYYY-MM-DD|YYYY-MM-DD"
const cacheMap = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// Default = current calendar month
function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { since: `${y}-${m}-01`, until: `${y}-${m}-${lastDay}` };
}

export default async function handler(req, res) {
  // ── Auth guard ────────────────────────────────────────────────
  const session = await requireAuth(req, res);
  if (!session) return;

  // ── Parse date range from query params ───────────────────────
  let since, until;
  if (req.query.from && req.query.to) {
    since = req.query.from;  // YYYY-MM-DD
    until = req.query.to;
  } else {
    const cm = currentMonthRange();
    since = cm.since;
    until = cm.until;
  }

  const cacheKey = `${since}|${until}`;

  // ── Cache check ───────────────────────────────────────────────
  const cached = cacheMap.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Range', cacheKey);
    return res.status(200).json(cached.data);
  }

  // ── Validate env ──────────────────────────────────────────────
  try { token(); accountId(); } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  // ── 1. Fetch campaigns for the requested range ────────────────
  let campaigns;
  try {
    campaigns = await fetchCampaigns(since, until);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to fetch campaigns', detail: err.message });
  }

  const leadCampaigns = campaigns.filter(c =>
    /OUTCOME_LEADS|LEAD_GENERATION/i.test(c.objective || '')
  );

  if (!leadCampaigns.length) {
    const payload = emptyPayload(`No lead-objective campaigns found for ${since} → ${until}`);
    return res.status(200).json(payload);
  }

  // ── 2. Fetch ads with insights for this range ─────────────────
  let rawAds = [];
  try {
    rawAds = await fetchAdsWithInsights(leadCampaigns.map(c => c.id), since, until);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to fetch ads', detail: err.message });
  }

  const campaignNameMap = Object.fromEntries(leadCampaigns.map(c => [c.id, c.name]));

  // ── 3. Pull sheet data for join ───────────────────────────────
  let sheetLeads = [];
  try {
    const sheetRes = await fetch(
      `http://localhost:${process.env.PORT || 3001}/api/sheet`,
      { timeout: 15000 }
    );
    if (sheetRes.ok) {
      const sheetJson = await sheetRes.json();
      sheetLeads = sheetJson.leads || [];
    }
  } catch { /* non-fatal */ }

  const sheetIndex = buildSheetIndex(sheetLeads);

  // ── 4. Process each ad ────────────────────────────────────────
  const adStats = [];
  let totalMetaSpend = 0;
  let totalMetaLeads = 0;

  for (const ad of rawAds) {
    const leads    = extractLeadCount(ad.insights);
    const spend    = extractSpend(ad.insights);
    const cpl      = leads > 0 ? spend / leads : 0;
    const resolvedCampaignName = campaignNameMap[ad.campaign_id] || ad.campaign_name || '';
    const lang     = classifyLanguage(resolvedCampaignName, ad.adset_name);

    const spec = ad.creative?.object_story_spec;
    const fullImg = spec?.video_data?.image_url
      || spec?.link_data?.picture
      || spec?.photo_data?.images?.[0]?.url
      || null;
    const thumbRaw = ad.creative?.thumbnail_url || null;
    const thumbUrl = fullImg || (thumbRaw ? thumbRaw.replace(/&_nc_cat=\d+/, '') + '&width=600' : null);

    totalMetaSpend += spend;
    totalMetaLeads += leads;

    adStats.push({
      adId:         ad.id,
      adName:       ad.name,
      adsetName:    ad.adset_name || '',
      campaignId:   ad.campaign_id,
      campaignName: resolvedCampaignName,
      thumbnailUrl: thumbUrl,
      language:     lang,
      leads,
      spend,
      cpl,
      qualifiedLeads: 0,
      relevantLeads:  0,
      closedDeals:    0,
    });
  }

  // ── 5. Pull form leads for this range + join to sheet ─────────
  let metaFormLeads = [];
  try {
    const sinceTs = Math.floor(new Date(since + 'T00:00:00Z').getTime() / 1000) - 7200;
    const untilTs = Math.floor(new Date(until + 'T23:59:59Z').getTime() / 1000);
    metaFormLeads = await graphGetAll(`${accountId()}/leads`, {
      fields: 'id,created_time,field_data,ad_id,form_id',
      filtering: JSON.stringify([
        { field: 'time_created', operator: 'GREATER_THAN', value: sinceTs },
        { field: 'time_created', operator: 'LESS_THAN',    value: untilTs },
      ]),
      limit: 100,
    });
  } catch { /* non-fatal */ }

  let unmatchedCount = 0;
  const adQualMap = {};

  for (const ml of metaFormLeads) {
    const fields = {};
    for (const f of ml.field_data || []) {
      fields[f.name?.toLowerCase()] = f.values?.[0] || '';
    }
    const phone = normalizePhone(fields['phone_number'] || fields['phone'] || '');
    const email = normalizeEmail(fields['email'] || '');
    const adId  = ml.ad_id;
    const ad    = adStats.find(a => a.adId === adId);
    const formName = ad?.adName || '';

    const sheetRow = lookupSheetLeadDirect(phone, email, formName, sheetIndex);
    if (!sheetRow) { unmatchedCount++; continue; }

    if (!adQualMap[adId]) adQualMap[adId] = { qualified: 0, relevant: 0, closed: 0 };
    if (sheetRow.relevant)                       adQualMap[adId].qualified++;
    if (sheetRow.relevant)                       adQualMap[adId].relevant++;
    if (sheetRow.dealStage === 'Deal Closed')     adQualMap[adId].closed++;
  }

  for (const ad of adStats) {
    const q = adQualMap[ad.adId];
    if (q) {
      ad.qualifiedLeads = q.qualified;
      ad.relevantLeads  = q.relevant;
      ad.closedDeals    = q.closed;
    }
  }

  // ── 6. Composite scores + top 3 ──────────────────────────────
  const avgCpl = totalMetaLeads > 0 ? totalMetaSpend / totalMetaLeads : 0;

  for (const ad of adStats) {
    ad.compositeScore = compositeScore(ad.qualifiedLeads, ad.leads, ad.cpl, avgCpl);
  }

  const activeAds = adStats.filter(a => a.spend > 0 || a.leads > 0);
  const rankable  = activeAds.filter(a => a.leads > 0);
  const sortPool  = rankable.length > 0 ? rankable : activeAds;
  const sorted    = [...sortPool].sort((a, b) => b.compositeScore - a.compositeScore);
  const top3      = sorted.slice(0, 3).map(ad => ({
    ...ad,
    reasons:        buildReasons(ad, avgCpl, totalMetaLeads, adStats),
    recommendation: buildRecommendation(ad),
  }));

  // ── 7. Language split ─────────────────────────────────────────
  const langBuckets = { arabic: zero(), english: zero(), other: zero() };
  for (const ad of activeAds) {
    const b = langBuckets[ad.language] || langBuckets.other;
    b.totalLeads += ad.leads;
    b.qualified  += ad.qualifiedLeads;
    b.relevant   += ad.relevantLeads;
    b.closed     += ad.closedDeals;
    b.totalSpend += ad.spend;
  }
  for (const b of Object.values(langBuckets)) {
    b.avgCpl = b.totalLeads > 0 ? b.totalSpend / b.totalLeads : 0;
  }

  // ── 8. Build + cache response ─────────────────────────────────
  const asOf = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' })
    .replace(' ', 'T') + '+02:00';

  const payload = {
    asOf,
    dateRange: { since, until },
    topCreatives: top3,
    languageSplit: {
      arabic:  langBuckets.arabic,
      english: langBuckets.english,
      other:   langBuckets.other,
    },
    diagnostics: {
      totalAds:           rawAds.length,
      totalMetaLeads,
      totalMetaSpend,
      unmatchedMetaLeads: unmatchedCount,
    },
  };

  cacheMap.set(cacheKey, { data: payload, at: Date.now() });

  // Evict old cache entries (keep max 20 ranges)
  if (cacheMap.size > 20) {
    const oldest = [...cacheMap.entries()].sort((a, b) => a[1].at - b[1].at)[0][0];
    cacheMap.delete(oldest);
  }

  res.setHeader('X-Cache', 'MISS');
  res.setHeader('X-Cache-Range', cacheKey);
  res.status(200).json(payload);
}

// ── Helpers ────────────────────────────────────────────────────

function zero() {
  return { totalLeads: 0, qualified: 0, relevant: 0, closed: 0, totalSpend: 0, avgCpl: 0 };
}

function emptyPayload(note) {
  return {
    asOf: new Date().toISOString(),
    topCreatives: [],
    languageSplit: { arabic: zero(), english: zero(), other: zero() },
    diagnostics: { note, totalMetaLeads: 0, totalMetaSpend: 0 },
  };
}

function buildSheetIndex(sheetLeads) {
  const byPhone = new Map();
  const byEmail = new Map();
  for (const l of sheetLeads) {
    const ph = normalizePhone(l.phone);
    const em = normalizeEmail(l.email);
    if (ph) byPhone.set(ph, l);
    if (em) byEmail.set(em, l);
  }
  return { byPhone, byEmail };
}

function lookupSheetLeadDirect(phone, email, formName, index) {
  if (phone) { const hit = index.byPhone.get(phone); if (hit) return hit; }
  if (email) { const hit = index.byEmail.get(email); if (hit) return hit; }
  return null;
}

function buildReasons(ad, avgCpl, totalLeads, allAds) {
  const reasons = [];
  const accountAvgQual = allAds.length > 0
    ? allAds.reduce((s, a) => s + (a.leads > 0 ? a.qualifiedLeads / a.leads : 0), 0) / allAds.length
    : 0;
  if (ad.cpl > 0 && avgCpl > 0 && ad.cpl < avgCpl)
    reasons.push(`CPL EGP ${Math.round(ad.cpl)} vs avg EGP ${Math.round(avgCpl)}`);
  const qualRate = ad.leads > 0 ? ad.qualifiedLeads / ad.leads : 0;
  if (qualRate > accountAvgQual && ad.leads > 0)
    reasons.push(`${Math.round(qualRate * 100)}% qualified vs ${Math.round(accountAvgQual * 100)}% avg`);
  if (ad.closedDeals > 0) {
    const sharePct = totalLeads > 0 ? Math.round(ad.closedDeals / totalLeads * 100) : 0;
    reasons.push(`${ad.closedDeals} closed deal${ad.closedDeals > 1 ? 's' : ''} — ${sharePct}% of total`);
  }
  if (!reasons.length) reasons.push(`${ad.leads} leads in selected period`);
  return reasons;
}

function buildRecommendation(ad) {
  const lang = ad.language === 'arabic' ? 'Arabic-language' : ad.language === 'english' ? 'English-language' : '';
  const base = lang ? `Replicate the ${lang} angle` : 'Replicate this creative angle';
  return `${base} — produce 3–4 variants swapping location or offer callout.`;
}
