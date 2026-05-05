/**
 * MQR Dashboard — Google Ads Daily Sync
 * ─────────────────────────────────────
 * Paste this into: Google Ads → Tools & Settings → Scripts → + New script
 * Then: Authorise → Run once (backfills 90 days) → Set daily schedule
 *
 * What it does:
 *   Pulls daily spend, clicks, impressions, conversions from your account
 *   and writes them into a DEDICATED Google Sheet (separate from your CRM).
 *   The MQR dashboard reads from that sheet automatically.
 *
 * Setup:
 *   1. Create a brand new blank Google Sheet (e.g. "MQR Google Ads Spend")
 *   2. Share it with your service account email (Editor access)
 *   3. Paste that sheet's URL below as SPREADSHEET_URL
 *   4. Copy that sheet's ID (the long string in the URL) and add it to Vercel
 *      as GOOGLE_ADS_SHEET_ID
 */

// ── CONFIG ─────────────────────────────────────────────────────────────────
var SPREADSHEET_URL = 'PASTE_YOUR_NEW_GOOGLE_ADS_SHEET_URL_HERE';
var TAB_NAME        = 'Google Ads Data';
var DAYS_TO_SYNC    = 90;   // how many days to backfill on first run
// ──────────────────────────────────────────────────────────────────────────

function main() {
  // 1. Open the CRM spreadsheet and get (or create) the data tab
  var ss    = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var sheet = ss.getSheetByName(TAB_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(TAB_NAME);
    var headers = [['Date','Spend (EGP)','Clicks','Impressions','CTR (%)','Avg CPC (EGP)','Conversions']];
    sheet.getRange(1, 1, 1, 7).setValues(headers)
         .setFontWeight('bold').setBackground('#1877F2').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
  }

  // 2. Build date range
  var endDate   = new Date();
  var startDate = new Date();
  startDate.setDate(endDate.getDate() - DAYS_TO_SYNC);

  var fmt = function(d) {
    return Utilities.formatDate(d, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
  };

  // 3. Query Google Ads — daily totals across ALL campaigns
  var query =
    'SELECT segments.date, metrics.cost_micros, metrics.clicks, ' +
    '       metrics.impressions, metrics.conversions ' +
    'FROM   campaign ' +
    "WHERE  segments.date BETWEEN '" + fmt(startDate) + "' AND '" + fmt(endDate) + "' " +
    "  AND  campaign.status != 'REMOVED' " +
    'ORDER BY segments.date ASC';

  // 4. Aggregate by date (sums across all campaigns per day)
  var byDate = {};
  var rows   = AdsApp.search(query);

  while (rows.hasNext()) {
    var row  = rows.next();
    var date = row.segments.date;                        // "YYYY-MM-DD"

    if (!byDate[date]) {
      byDate[date] = { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
    }
    byDate[date].spend       += (row.metrics.costMicros || 0) / 1e6; // micros → EGP
    byDate[date].clicks      += row.metrics.clicks       || 0;
    byDate[date].impressions += row.metrics.impressions  || 0;
    byDate[date].conversions += row.metrics.conversions  || 0;
  }

  // 5. Build output array
  var dates  = Object.keys(byDate).sort();
  var output = dates.map(function(date) {
    var d   = byDate[date];
    var ctr = d.impressions > 0 ? +(d.clicks / d.impressions * 100).toFixed(2) : 0;
    var cpc = d.clicks      > 0 ? +(d.spend  / d.clicks).toFixed(2)            : 0;
    return [date, +d.spend.toFixed(2), d.clicks, d.impressions, ctr, cpc, Math.round(d.conversions)];
  });

  // 6. Clear old rows and rewrite (full refresh — always accurate)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 7).clearContent();
  if (output.length > 0) sheet.getRange(2, 1, output.length, 7).setValues(output);

  Logger.log('MQR sync complete — ' + output.length + ' days written to "' + TAB_NAME + '"');
}
