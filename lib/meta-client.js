// Pure Meta Graph API wrappers — no I/O side effects beyond fetching
import fetch from 'node-fetch';

const BASE = 'https://graph.facebook.com';

export function apiVersion() {
  return process.env.META_API_VERSION || 'v21.0';
}

export function token() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error('META_ACCESS_TOKEN is not set');
  return t;
}

export function accountId() {
  const id = process.env.META_AD_ACCOUNT_ID;
  if (!id) throw new Error('META_AD_ACCOUNT_ID is not set');
  return id.startsWith('act_') ? id : `act_${id}`;
}

// ── Generic Graph API GET ──────────────────────────────────────
export async function graphGet(path, params = {}) {
  const url = new URL(`${BASE}/${apiVersion()}/${path}`);
  url.searchParams.set('access_token', token());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), { timeout: 20000 });
  const json = await res.json();

  if (json.error) {
    const e = json.error;
    throw new Error(`Meta API error ${e.code}/${e.error_subcode || 0}: ${e.message}`);
  }
  return json;
}

// Paginate through all pages of a Graph API list response
export async function graphGetAll(path, params = {}, maxPages = 20) {
  const results = [];
  let nextUrl = null;
  let page = 0;

  const first = await graphGet(path, params);
  if (first.data) results.push(...first.data);
  nextUrl = first.paging?.next || null;

  while (nextUrl && page < maxPages) {
    const res = await fetch(nextUrl, { timeout: 20000 });
    const json = await res.json();
    if (json.error) break;
    if (json.data) results.push(...json.data);
    nextUrl = json.paging?.next || null;
    page++;
  }

  return results;
}

// ── Dynamic time range helper ─────────────────────────────────
export function makeRange(since, until) {
  return { since, until };
}

// ── Campaigns for a given date range ─────────────────────────
export async function fetchCampaigns(since, until) {
  return graphGetAll(`${accountId()}/campaigns`, {
    fields: 'id,name,objective,status',
    time_range: JSON.stringify({ since, until }),
    limit: 100,
  });
}

// Keep backward-compat alias (still used by old code paths)
export async function fetchAprilCampaigns() {
  return fetchCampaigns('2026-04-01', '2026-04-30');
}

// ── Ads with insights for a given date range ──────────────────
export async function fetchAdsWithInsights(campaignIds, since, until) {
  if (!campaignIds.length) return [];
  const campaignSet = new Set(campaignIds);
  const timeRange = JSON.stringify({ since, until });

  const ads = await graphGetAll(`${accountId()}/ads`, {
    fields: [
      'id',
      'name',
      'adset_id',
      'adset_name',
      'campaign_id',
      'campaign_name',
      'effective_status',
      'creative{id,name,thumbnail_url,object_story_spec}',
      `insights.time_range(${timeRange}){spend,impressions,ctr,cpm,actions}`,
    ].join(','),
    limit: 200,
  });

  return ads.filter(ad => campaignSet.has(ad.campaign_id));
}

// ── Form leads for a given date range ────────────────────────
export async function fetchFormLeads(formId, since) {
  try {
    const sinceTs = Math.floor(new Date(since + 'T00:00:00Z').getTime() / 1000) - 7200; // 2h buffer
    const leads = await graphGetAll(`${formId}/leads`, {
      fields: 'id,created_time,field_data,ad_id,adset_id,campaign_id,form_id',
      filtering: JSON.stringify([{
        field: 'time_created',
        operator: 'GREATER_THAN',
        value: sinceTs,
      }]),
      limit: 100,
    });
    return leads;
  } catch {
    return [];
  }
}

// ── Phone normalization (Egyptian numbers → E.164) ────────────
export function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[\s\-().+]/g, '');
  // Remove leading zeros
  s = s.replace(/^0+/, '');
  // If starts with 20 already (country code) → prepend +
  if (s.startsWith('20') && s.length >= 11) return '+' + s;
  // If 10 digits starting with 1 → Egyptian mobile
  if (/^1[0-9]{9}$/.test(s)) return '+20' + s;
  // If 11 digits starting with 01 → strip leading 0
  if (/^[0-9]{11}$/.test(s)) return '+20' + s.slice(1);
  // Fallback: return normalized without +
  return s || null;
}

export function normalizeEmail(raw) {
  return raw ? String(raw).trim().toLowerCase() : null;
}

// ── Language classification ───────────────────────────────────
export function classifyLanguage(campaignName, adsetName) {
  const haystack = `${campaignName || ''} ${adsetName || ''}`.toLowerCase();
  if (haystack.includes('arabic')) return 'arabic';
  if (haystack.includes('english')) return 'english';
  return 'other';
}

// ── Composite score for creative ranking ──────────────────────
// score = (qualifiedRate × log1p(totalLeads)) − normalizedCpl
// Weights are tunable here.
export function compositeScore(qualifiedLeads, totalLeads, cpl, avgCpl) {
  const qualRate = totalLeads > 0 ? qualifiedLeads / totalLeads : 0;
  const volumeBoost = Math.log1p(totalLeads);
  const cplPenalty = avgCpl > 0 ? cpl / avgCpl : 1;
  return (qualRate * volumeBoost) - cplPenalty;
}

// ── Extract leads count from insights actions array ───────────
export function extractLeadCount(insightsData) {
  if (!insightsData?.data?.[0]?.actions) return 0;
  const action = insightsData.data[0].actions.find(
    a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
  );
  return action ? parseInt(action.value, 10) : 0;
}

export function extractSpend(insightsData) {
  return insightsData?.data?.[0]?.spend
    ? parseFloat(insightsData.data[0].spend)
    : 0;
}
