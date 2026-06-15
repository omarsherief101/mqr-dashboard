/* Generates preview-mobile.html: the real dashboard with mock API data
   injected via a window.fetch override, so it renders fully without auth. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// ── Deterministic RNG ───────────────────────────────────────
let _seed = 1337;
function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function pad(n) { return String(n).padStart(2, '0'); }

const sources   = ['Meta Form', 'Website', 'DMs'];
const products  = ['Private Office', 'Meeting Room', 'Virtual Office', 'Coworking Desk', 'Event Space', 'Dedicated Desk'];
const locations = ['Downtown Cairo', 'Maadi', 'Zamalek', 'New Cairo', 'Heliopolis', '6th of October', 'Sheikh Zayed'];
const stages    = ['Deal Closed', 'In Discussions', 'Tour & Meeting', 'Future Sale', 'Deal Lost', 'Not Interested', 'Quotation Sent', null, null];
const reps      = ['Ahmed Hassan', 'Sara Mohamed', 'Omar Ali', 'Nour Adel', 'Khaled Sami', 'Mona Tarek', 'Yara Fouad', 'Do Not Call', "Please don't contact him"];
const statuses  = ['Replied', 'Contacted', 'Pending', 'No Answer'];

function positive(stage) {
  return ['Deal Closed', 'In Discussions', 'Tour & Meeting', 'Future Sale', 'Quotation Sent'].includes(stage);
}

const leads = [];
const spend = [];
const metaDaily = [];
const start = new Date('2026-04-01T00:00:00');
for (let d = 0; d < 68; d++) {
  const day = new Date(start); day.setDate(start.getDate() + d);
  const ds = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  const n = 5 + Math.floor(rnd() * 16);
  let metaCount = 0;
  for (let i = 0; i < n; i++) {
    const src = pick(sources);
    if (src === 'Meta Form') metaCount++;
    const referredFrom = src === 'Website' && rnd() < 0.5 ? 'Google' : null;

    // Decide the lead's processing state so we get all three buckets:
    //   ~30% uncontacted (brand-new: no status, no stage, no quality)
    //   of the rest: relevant / irrelevant based on assessment
    const roll = rnd();
    let stage, contactStatus, contactedBy, leadQuality, relevant;
    if (roll < 0.30) {
      // Uncontacted — nothing filled in yet
      stage = null; contactStatus = ''; contactedBy = null; leadQuality = null; relevant = false;
    } else {
      stage = pick(stages);
      contactStatus = pick(statuses);
      contactedBy = pick(reps);
      const isRel = rnd() < 0.55 || positive(stage);
      if (isRel) { relevant = true; leadQuality = 'Relevant'; }
      else { relevant = false; leadQuality = 'Not Relevant'; }
    }

    leads.push({
      date: ds,
      source: src,
      referredFrom,
      formName: src === 'Meta Form' ? 'Office Lead Form' : null,
      name: pick(['Ahmed', 'Mohamed', 'Sara', 'Laila', 'Omar', 'Hana', 'Youssef', 'Mariam']) + ' ' + pick(['A.', 'M.', 'S.', 'K.', 'T.', 'F.']),
      phone: '+2010' + Math.floor(10000000 + rnd() * 89999999),
      email: 'lead' + Math.floor(rnd() * 99999) + '@example.com',
      location: pick(locations),
      product: pick(products),
      contactedBy: contactedBy,
      contactStatus: contactStatus,
      relevant: relevant,
      leadQuality: leadQuality,
      dealStage: stage,
      googleSpend: 0,
    });
  }
  const gspend = 800 + Math.floor(rnd() * 1600);
  spend.push({ date: ds, google: gspend, clicks: 40 + Math.floor(rnd() * 120), impressions: 2000 + Math.floor(rnd() * 8000), conversions: Math.floor(rnd() * 6), meta: null });
  metaDaily.push({ date: ds, spend: 500 + Math.floor(rnd() * 1400), leads: metaCount, impressions: 3000 + Math.floor(rnd() * 12000), clicks: 60 + Math.floor(rnd() * 200) });
}

// ── Project landing-page forms (regression check for the source-classification bug):
//    Lead Source = form name, Referred From = "Website". Must show under their own
//    name in the source breakdown, NOT be absorbed into "Website".
[['AlBurouj Form', 'Website'], ['Al Burouj Form', 'Website'], ['AlBurouj Form', 'Website'],
 ['AlBurouj Form', ''], ['Al Burouj Form', 'Website'], ['AlBurouj Form', 'Website'],
 ['Nile City Form', 'Website'], ['Nile City Form', '']].forEach((pair, i) => {
  leads.push({
    date: `2026-06-0${(i % 8) + 1}`, source: pair[0], referredFrom: pair[1],
    formName: null, name: 'Form Lead ' + i, phone: '+201000000' + i,
    email: 'form' + i + '@example.com', location: 'New Heliopolis - AlBurouj',
    product: 'Membership', contactedBy: 'Ali', contactStatus: 'Replied',
    relevant: i % 2 === 0, leadQuality: i % 2 === 0 ? 'Relevant' : 'Irrelevant',
    dealStage: null, googleSpend: 0,
  });
});

const totalMetaSpend = metaDaily.reduce((s, d) => s + d.spend, 0);

const mock = {
  '/api/auth/me': { name: 'Omar Sherief', email: 'omarsherief16@gmail.com', role: 'admin' },
  '/api/sheet': { asOf: '2026-06-08T10:00:00+02:00', leads, spend, meta: { totalRows: leads.length, parsedRows: leads.length, errors: [] } },
  '/api/meta-spend': { daily: metaDaily, since: '2026-04-01', until: '2026-06-08', fetchedAt: '2026-06-08T10:00:00Z' },
  '/api/meta': { diagnostics: { totalMetaSpend }, campaigns: [], creatives: [] },
};

const inject = `<script>
/* ===== PREVIEW MOCK — overrides fetch so the dashboard renders without auth ===== */
(function () {
  var MOCK = ${JSON.stringify(mock)};
  function jsonResp(body) {
    return Promise.resolve({
      ok: true, status: 200,
      json: function () { return Promise.resolve(body); },
      text: function () { return Promise.resolve(JSON.stringify(body)); },
      headers: { get: function () { return null; } },
    });
  }
  var _origFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, opts) {
    try {
      var u = typeof url === 'string' ? url : (url && url.url) || '';
      var pathOnly = u.split('?')[0];
      if (MOCK[pathOnly]) return jsonResp(MOCK[pathOnly]);
      if (pathOnly.indexOf('/api/meta') === 0) return jsonResp(MOCK['/api/meta']);
      if (pathOnly.indexOf('/api/') === 0) return jsonResp({ ok: true });
    } catch (e) {}
    return _origFetch ? _origFetch(url, opts) : jsonResp({});
  };
})();
<\/script>
`;

// Trailing script: once data is loaded, widen the date range to the full
// mock span so the preview shows rich data (app defaults to "TODAY").
const widen = `<script>
(function () {
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    try {
      if (typeof state !== 'undefined' && state.sheet && typeof renderAll === 'function') {
        clearInterval(iv);
        state.dateRange = { from: '2026-04-01', to: '2026-06-08' };
        try { var lbl = document.getElementById('drp-label'); if (lbl) lbl.textContent = 'DATE RANGE'; } catch (e) {}
        renderAll();
      }
    } catch (e) {}
    if (tries > 120) clearInterval(iv);
  }, 100);
})();
<\/script>
`;

let out = html.replace('<head>', '<head>\n' + inject);
out = out.replace('</body>', widen + '</body>');
fs.writeFileSync(path.join(root, '_preview', 'preview-mobile.html'), out, 'utf8');
console.log('Wrote _preview/preview-mobile.html with', leads.length, 'mock leads');
