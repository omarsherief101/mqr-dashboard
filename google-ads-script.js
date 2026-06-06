/**
 * MQR Dashboard — Google Ads Daily Sync
 * ─────────────────────────────────────
 * Paste this into: Google Ads → Tools & Settings → Scripts → + New script
 * Then: Authorise → Run once (backfills 90 days) → Set daily schedule
 *
 * What it does:
 *   Pulls daily spend, clicks, impressions, conversions from Search &
 *   Shopping campaigns only (excludes Display to avoid inflated numbers).
 *   Writes into a DEDICATED Google Sheet (separate from your CRM).
 *   The MQR dashboard reads from that sheet automatically.
 *
 * Setup:
 *   1. Create a brand new blank Google Sheet (e.g. "MQR Google Ads Spend")
 *   2. Share it with your service account email (Editor access)
 *   3. Paste that sheet's URL below as SPREADSHEET_URL
 *   4. Copy that sheet's ID (the long string in the URL between /d/ and /edit)
 *      and add it to Vercel as GOOGLE_ADS_SHEET_ID
 */

// ── CONFIG — fill in your sheet URL ────────────────────────────────────────
var SPREADSHEET_URL = 'PASTE_YOUR_NEW_GOOGLE_ADS_SHEET_URL_HERE';
var TAB_NAME        = 'Google Ads Data';
var DAYS_TO_SYNC    = 90;  // how many days to backfill on first run
// ──────────────────────────────────────────────────────────────────────────

function main() {
  // 1. Open the dedicated spend spreadsheet and get (or create) the data tab
  var ss    = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var sheet = ss.getSheetByName(TAB_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(TAB_NAME);
    sheet.setColumnWidth(1, 110);
  }

  // Always ensure the header row is correct (handles fresh tabs & re-runs)
  var headerValues = sheet.getRange(1, 1, 1, 7).getValues()[0];
  if (!headerValues[0] || headerValues[0].toString().toLowerCase() !== 'date') {
    sheet.getRange(1, 1, 1, 7)
         .setValues([['Date', 'Spend (EGP)', 'Clicks', 'Impressions', 'CTR (%)', 'Avg CPC (EGP)', 'Conversions']])
         .setFontWeight('bold')
         .setBackground('#1877F2')
         .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  // 2. Build date range
  var endDate   = new Date();
  var startDate = new Date();
  startDate.setDate(endDate.getDate() - DAYS_TO_SYNC);

  var tz  = AdsApp.currentAccount().getTimeZone();
  var fmt = function(d) {
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  };

  // 3. Query Google Ads — Search & Shopping campaigns only
  //    Excludes Display/Video to avoid inflated impression numbers
  var query =
    'SELECT segments.date, metrics.cost_micros, metrics.clicks, ' +
    '       metrics.impressions, metrics.conversions ' +
    'FROM   campaign ' +
    "WHERE  segments.date BETWEEN '" + fmt(startDate) + "' AND '" + fmt(endDate) + "' " +
    "  AND  campaign.status != 'REMOVED' " +
    "  AND  campaign.advertising_channel_type IN ('SEARCH', 'SHOPPING') " +
    'ORDER BY segments.date ASC';

  // 4. Aggregate by date (sums across all matching campaigns per day)
  var byDate = {};
  var rows   = AdsApp.search(query);

  while (rows.hasNext()) {
    var row  = rows.next();
    var date = row.segments.date; // "YYYY-MM-DD"

    if (!byDate[date]) {
      byDate[date] = { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
    }

    // costMicros → EGP (divide by 1,000,000)
    byDate[date].spend       += (parseInt(row.metrics.costMicros, 10) || 0) / 1e6;
    byDate[date].clicks      += parseInt(row.metrics.clicks, 10)      || 0;
    byDate[date].impressions += parseInt(row.metrics.impressions, 10) || 0;
    byDate[date].conversions += parseFloat(row.metrics.conversions)   || 0;
  }

  // 5. Build output array — one row per day
  var dates  = Object.keys(byDate).sort();
  var output = dates.map(function(date) {
    var d   = byDate[date];
    var ctr = d.impressions > 0 ? +(d.clicks / d.impressions * 100).toFixed(2) : 0;
    var cpc = d.clicks      > 0 ? +(d.spend  / d.clicks).toFixed(2)            : 0;
    return [
      date,
      +d.spend.toFixed(2),
      d.clicks,
      d.impressions,
      ctr,
      cpc,
      Math.round(d.conversions)
    ];
  });

  // 6. Full refresh — clear old data rows and rewrite (always accurate)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 7).clearContent();
  if (output.length > 0) sheet.getRange(2, 1, output.length, 7).setValues(output);

  Logger.log('MQR sync complete — ' + output.length + ' days written to "' + TAB_NAME + '"');
}
