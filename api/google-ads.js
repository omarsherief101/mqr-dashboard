import { fetchAprilCampaigns, adsCustomerId, devToken } from '../lib/google-ads-client.js';

// Module-scope 5-minute cache
const cache = { data: null, at: 0 };
const CACHE_TTL = 5 * 60 * 1000;

export default async function handler(req, res) {
  // Return cached response if fresh
  if (cache.data && Date.now() - cache.at < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache.data);
  }

  // Validate required env vars before making any API calls
  try {
    adsCustomerId();
    devToken();
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  // Fetch April 2026 campaign performance
  let result;
  try {
    result = await fetchAprilCampaigns();
  } catch (err) {
    return res.status(502).json({
      error:  'Google Ads API fetch failed',
      detail: err.message,
    });
  }

  const asOf = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' })
    .replace(' ', 'T') + '+02:00';

  const payload = {
    asOf,
    campaigns: result.campaigns,
    totals:    result.totals,
    meta: {
      customerId:    process.env.GOOGLE_ADS_CUSTOMER_ID,
      campaignCount: result.campaigns.length,
      period:        'April 2026 (2026-04-01 → 2026-04-30)',
    },
  };

  cache.data = payload;
  cache.at   = Date.now();

  res.setHeader('X-Cache', 'MISS');
  res.status(200).json(payload);
}
