import { google } from 'googleapis';
import {
  parseLeadsFromRows,
  parseSpendFromLeads,
} from '../lib/sheet-parser.js';
import { requireAuth } from '../lib/auth.js';

// Module-scope cache: survives across warm invocations on the same Vercel instance.
// v2: removed April-only filter — returns all leads from sheet
const cache = { data: null, at: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const creds = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

async function fetchSheetRows(auth, spreadsheetId, tabName) {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tabName, // fetches the entire tab
  });
  return res.data.values || [];
}

export default async function handler(req, res) {
  // ── Auth guard ────────────────────────────────────────────────
  const session = await requireAuth(req, res);
  if (!session) return;

  // Cache hit
  if (cache.data && Date.now() - cache.at < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache.data);
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const tabName = process.env.SHEET_TAB_NAME || 'Sheet1';
  const spendTabName = process.env.SHEET_SPEND_TAB_NAME || '';

  if (!spreadsheetId) {
    return res.status(502).json({
      error: 'GOOGLE_SHEET_ID is not configured',
      detail: 'Set GOOGLE_SHEET_ID in your Vercel env vars or .env.local',
    });
  }

  let auth;
  try {
    auth = getAuth();
  } catch (err) {
    return res.status(502).json({
      error: 'Service account credentials are invalid',
      detail: err.message,
    });
  }

  let leadsRows, spendRows = null;
  try {
    leadsRows = await fetchSheetRows(auth, spreadsheetId, tabName);
    if (spendTabName) {
      spendRows = await fetchSheetRows(auth, spreadsheetId, spendTabName);
    }
  } catch (err) {
    return res.status(502).json({
      error: 'Could not read Google Sheet',
      detail: err.message,
    });
  }

  const { leads, errors, totalRows } = parseLeadsFromRows(leadsRows);
  const spend = spendRows
    ? parseSpendFromRows(spendRows)
    : parseSpendFromLeads(leads);

  const asOf = new Date().toLocaleString('sv-SE', {
    timeZone: 'Africa/Cairo',
  }).replace(' ', 'T') + '+02:00';

  const payload = {
    asOf,
    leads,
    spend,
    meta: {
      totalRows,
      parsedRows: leads.length,
      errors,
    },
  };

  cache.data = payload;
  cache.at = Date.now();

  res.setHeader('X-Cache', 'MISS');
  res.status(200).json(payload);
}
