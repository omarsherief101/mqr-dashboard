// Pure Google Ads API wrappers — no I/O side effects beyond fetching
import fetch from 'node-fetch';

const ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v20';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ADS_BASE = `https://googleads.googleapis.com/${ADS_API_VERSION}`;

// ── Env accessors ─────────────────────────────────────────────
export function adsCustomerId() {
  const id = process.env.GOOGLE_ADS_CUSTOMER_ID;
  if (!id) throw new Error('GOOGLE_ADS_CUSTOMER_ID is not set');
  return id.replace(/-/g, ''); // strip dashes if present
}

export function devToken() {
  const t = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!t) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is not set — see README for how to obtain it');
  return t;
}

// ── OAuth2: exchange refresh token for access token ───────────
let _tokenCache = { token: null, expiresAt: 0 };

export async function getAccessToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 30_000) {
    return _tokenCache.token;
  }

  const clientId     = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET or GOOGLE_ADS_REFRESH_TOKEN');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  const json = await res.json();
  if (json.error) throw new Error(`OAuth2 error: ${json.error} — ${json.error_description}`);

  _tokenCache = {
    token:     json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return _tokenCache.token;
}

// ── Generic GAQL search ───────────────────────────────────────
export async function gaqlSearch(customerId, query) {
  const accessToken = await getAccessToken();

  const res = await fetch(`${ADS_BASE}/customers/${customerId}/googleAds:search`, {
    method: 'POST',
    headers: {
      'Authorization':   `Bearer ${accessToken}`,
      'developer-token': devToken(),
      'Content-Type':    'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const rawText = await res.text();

  // Parse JSON — if it fails expose the raw body for diagnosis
  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(`Non-JSON response (HTTP ${res.status}): ${rawText.slice(0, 400)}`);
  }

  if (json.error) {
    const e = json.error;
    throw new Error(`Google Ads API error ${e.code}: ${e.message} — ${JSON.stringify(e.details || e.status)}`);
  }

  // The search endpoint returns { results: [...], nextPageToken?, totalResultsCount? }
  return json.results || [];
}

// ── April 2026 campaign performance ──────────────────────────
export async function fetchAprilCampaigns() {
  const customerId = adsCustomerId();

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '2026-04-01' AND '2026-04-30'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `;

  const rows = await gaqlSearch(customerId, query);
  return normalizeCampaigns(rows);
}

// ── Normalize raw API rows → clean JSON ───────────────────────
export function normalizeCampaigns(rows) {
  const campaigns = rows.map(row => {
    const c  = row.campaign  || {};
    const m  = row.metrics   || {};

    const costEgp      = (m.costMicros || 0) / 1_000_000;
    const impressions  = Number(m.impressions  || 0);
    const clicks       = Number(m.clicks       || 0);
    const conversions  = parseFloat(m.conversions || 0);
    const ctr          = impressions > 0 ? clicks / impressions : 0;
    const cpc          = clicks > 0      ? costEgp / clicks     : 0;
    const cpa          = conversions > 0 ? costEgp / conversions : 0;

    return {
      id:           c.id             || '',
      name:         c.name           || '',
      status:       c.status         || '',
      channelType:  c.advertisingChannelType || '',
      impressions,
      clicks,
      conversions,
      costEgp:      Math.round(costEgp * 100) / 100,
      ctr:          Math.round(ctr  * 10000) / 10000,   // 4 decimal places
      cpc:          Math.round(cpc  * 100)   / 100,
      cpa:          Math.round(cpa  * 100)   / 100,
    };
  });

  // Account-level totals
  const totals = campaigns.reduce((acc, c) => {
    acc.impressions  += c.impressions;
    acc.clicks       += c.clicks;
    acc.conversions  += c.conversions;
    acc.costEgp      += c.costEgp;
    return acc;
  }, { impressions: 0, clicks: 0, conversions: 0, costEgp: 0 });

  totals.costEgp    = Math.round(totals.costEgp * 100) / 100;
  totals.avgCtr     = totals.impressions > 0 ? Math.round(totals.clicks / totals.impressions * 10000) / 10000 : 0;
  totals.avgCpc     = totals.clicks      > 0 ? Math.round(totals.costEgp / totals.clicks * 100)      / 100   : 0;
  totals.avgCpa     = totals.conversions > 0 ? Math.round(totals.costEgp / totals.conversions * 100) / 100   : 0;

  return { campaigns, totals };
}
