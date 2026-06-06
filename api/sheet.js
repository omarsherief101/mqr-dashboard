import { google } from 'googleapis';
import {
  parseLeadsFromRows,
  parseSpendFromLeads,
  parseSpendFromRows,
} from '../lib/sheet-parser.js';
import { requireAuth } from '../lib/auth.js';

// ── Module-scope cache — survives warm re-invocations on the same instance ──
const cache = { data: null, at: 0, stale: null }; // stale = last known-good payload
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── In-flight deduplication — prevents thundering-herd on simultaneous cold starts ──
let _inflight = null;

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const creds = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// Fetch sheet rows with a hard timeout so we never hang past Vercel's 10s limit
async function fetchSheetRows(auth, spreadsheetId, tabName, timeoutMs = 8000) {
  const sheets = google.sheets({ version: 'v4', auth });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Sheet fetch timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  const fetchPromise = sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tabName,
  }).then(res => res.data.values || []);

  return Promise.race([fetchPromise, timeoutPromise]);
}

async function doFetch() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tabName       = process.env.SHEET_TAB_NAME || 'Sheet1';
  const adsSheetId    = process.env.GOOGLE_ADS_SHEET_ID || '';
  const adsTabName    = process.env.GOOGLE_ADS_TAB_NAME || 'Google Ads Data';

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured — set it in Vercel env vars');
  }

  const auth = getAuth();

  const [leadsRows, spendRows] = await Promise.all([
    fetchSheetRows(auth, spreadsheetId, tabName, 8000),
    adsSheetId
      ? fetchSheetRows(auth, adsSheetId, adsTabName, 5000).catch(() => null)
      : Promise.resolve(null),
  ]);

  const { leads, errors, totalRows } = parseLeadsFromRows(leadsRows);
  const spend = spendRows
    ? parseSpendFromRows(spendRows)
    : parseSpendFromLeads(leads);

  const asOf = new Date().toLocaleString('sv-SE', {
    timeZone: 'Africa/Cairo',
  }).replace(' ', 'T') + '+02:00';

  return {
    asOf,
    leads,
    spend,
    meta: { totalRows, parsedRows: leads.length, errors },
  };
}

export default async function handler(req, res) {
  // ── Auth guard ────────────────────────────────────────────────
  const session = await requireAuth(req, res);
  if (!session) return;

  // ── Cache hit ────────────────────────────────────────────────
  if (cache.data && Date.now() - cache.at < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache.data);
  }

  // ── In-flight dedup — if a fetch is already running, wait for it ──
  if (_inflight) {
    try {
      const payload = await _inflight;
      res.setHeader('X-Cache', 'DEDUP');
      return res.status(200).json(payload);
    } catch {
      // fallthrough to stale or error
    }
  }

  // ── Start fresh fetch ────────────────────────────────────────
  _inflight = doFetch().then(payload => {
    cache.data  = payload;
    cache.stale = payload; // save as stale backup
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
    // ── Stale fallback — serve last known good data with a warning ──
    if (cache.stale) {
      console.error('[sheet] Refresh failed, serving stale cache:', err.message);
      res.setHeader('X-Cache', 'STALE');
      res.setHeader('X-Cache-Stale-Reason', err.message.slice(0, 120));
      return res.status(200).json({
        ...cache.stale,
        _stale: true,
        _staleReason: err.message,
      });
    }

    // No stale data — return descriptive error
    console.error('[sheet] Fatal fetch error:', err.message);
    return res.status(502).json({
      error: 'Could not read Google Sheet',
      detail: err.message,
    });
  }
}
