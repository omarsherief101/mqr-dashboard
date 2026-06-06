/**
 * GET /api/meta-spend
 * ─────────────────────────────────────────────────────────
 * Lightweight Meta spend endpoint — returns 180 days of
 * DAILY spend + lead counts at the ad-account level.
 *
 * Reliability hardening:
 *  - In-flight deduplication (thundering herd protection)
 *  - Stale-while-revalidate: serves last good data on API failure
 *  - Token expiry detection: returns 401 with clear message
 */

import { requireAuth } from '../lib/auth.js';
import { token, accountId } from '../lib/meta-client.js';

const cache = { data: null, at: 0, stale: null };
const CACHE_TTL = 5 * 60 * 1000;
const DAYS      = 180;

// In-flight deduplication
let _inflight = null;

function isTokenExpiredMsg(msg) {
  return /token|expired|session|OAuthException/i.test(msg || '');
}

function mapRow(row) {
  const leadAction = (row.actions || []).find(
    a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
  );
  return {
    date:        row.date_start,
    spend:       parseFloat(row.spend) || 0,
    leads:       parseInt(leadAction?.value || '0', 10),
    impressions: parseInt(row.impressions || '0', 10),
    clicks:      parseInt(row.clicks || '0', 10),
  };
}

async function doFetch(tok, accId) {
  const fmt   = d => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date(Date.now() - DAYS * 86400000);

  const url = [
    `https://graph.facebook.com/v21.0/act_${accId}/insights`,
    `?fields=spend,impressions,clicks,actions`,
    `&time_increment=1`,
    `&time_range={"since":"${fmt(since)}","until":"${fmt(until)}"}`,
    `&action_type=lead`,
    `&access_token=${tok}`,
    `&limit=200`,
  ].join('');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000); // 18s hard timeout

  let json;
  try {
    const r = await fetch(url, { signal: controller.signal });
    json = await r.json();
  } finally {
    clearTimeout(timeout);
  }

  if (json.error) {
    const err = new Error(json.error.message);
    err.code = json.error.code;
    throw err;
  }

  let daily = (json.data || []).map(mapRow);

  // Paginate (rare for 180 days but safe)
  // Each page fetch gets its own 15s timeout — prevents hanging on slow pages
  let next = json.paging?.next;
  let guard = 0;
  while (next && guard++ < 10) {
    const pageCtrl = new AbortController();
    const pageTimer = setTimeout(() => pageCtrl.abort(), 15000);
    try {
      const r2    = await fetch(next, { signal: pageCtrl.signal });
      const json2 = await r2.json();
      if (json2.error) break;
      daily.push(...(json2.data || []).map(mapRow));
      next = json2.paging?.next;
    } catch {
      break; // timeout or network error on pagination — return what we have
    } finally {
      clearTimeout(pageTimer);
    }
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));

  return {
    daily,
    since:     fmt(since),
    until:     fmt(until),
    fetchedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  // ── Auth guard ──────────────────────────────────────────
  const session = await requireAuth(req, res);
  if (!session) return;

  // ── Cache hit ───────────────────────────────────────────
  if (cache.data && Date.now() - cache.at < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache.data);
  }

  // ── Validate env ────────────────────────────────────────
  let tok, accId;
  try {
    tok   = token();
    accId = accountId().replace(/^act_/, '');
  } catch (err) {
    if (cache.stale) return res.status(200).json({ ...cache.stale, _stale: true });
    return res.status(502).json({ error: err.message });
  }

  // ── In-flight deduplication ─────────────────────────────
  if (_inflight) {
    try {
      const payload = await _inflight;
      res.setHeader('X-Cache', 'DEDUP');
      return res.status(200).json(payload);
    } catch { /* fallthrough */ }
  }

  // ── Fetch ───────────────────────────────────────────────
  _inflight = doFetch(tok, accId).then(payload => {
    cache.data  = payload;
    cache.stale = payload;
    cache.at    = Date.now();
    _inflight   = null;
    return payload;
  }).catch(err => {
    _inflight = null;
    throw err;
  });

  try {
    const payload = await _inflight;
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (err) {
    // Token expired — specific error
    if (isTokenExpiredMsg(err.message)) {
      if (cache.stale) {
        return res.status(200).json({ ...cache.stale, _stale: true, _staleReason: 'token_expired' });
      }
      return res.status(401).json({
        error: 'meta_token_expired',
        detail: 'Meta access token has expired. Please renew it in Vercel environment variables.',
      });
    }
    // Other failure — serve stale if available
    if (cache.stale) {
      console.error('[meta-spend] Serving stale cache due to error:', err.message);
      return res.status(200).json({ ...cache.stale, _stale: true, _staleReason: err.message });
    }
    return res.status(502).json({ error: 'Failed to fetch Meta spend', detail: err.message });
  }
}
