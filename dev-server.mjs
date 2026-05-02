// Minimal dev server — serves index.html + /api/* routes
// Usage: node server.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;

// Load .env.local
try {
  const env = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  }
} catch {}

// Fake res wrapper to match Vercel's (req, res) API
function makeRes(nodeRes) {
  const headers = {};
  return {
    statusCode: 200,
    setHeader(k, v) { headers[k] = v; nodeRes.setHeader(k, v); },
    status(code) { this.statusCode = code; nodeRes.statusCode = code; return this; },
    json(data) {
      nodeRes.setHeader('Content-Type', 'application/json');
      nodeRes.end(JSON.stringify(data));
    },
    end(body) { nodeRes.end(body); },
  };
}

const server = http.createServer(async (req, nodeRes) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  nodeRes.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (url.pathname === '/api/sheet') {
      const { default: handler } = await import('./api/sheet.js?t=' + Date.now());
      await handler(req, makeRes(nodeRes));
      return;
    }
    if (url.pathname === '/api/meta') {
      const { default: handler } = await import('./api/meta.js?t=' + Date.now());
      await handler(req, makeRes(nodeRes));
      return;
    }
    if (url.pathname === '/api/google-ads') {
      const { default: handler } = await import('./api/google-ads.js?t=' + Date.now());
      await handler(req, makeRes(nodeRes));
      return;
    }
  } catch (err) {
    nodeRes.statusCode = 502;
    nodeRes.setHeader('Content-Type', 'application/json');
    nodeRes.end(JSON.stringify({ error: err.message }));
    return;
  }

  // Serve index.html for everything else
  const htmlPath = path.join(__dirname, 'index.html');
  try {
    const html = fs.readFileSync(htmlPath, 'utf8');
    nodeRes.setHeader('Content-Type', 'text/html');
    nodeRes.end(html);
  } catch {
    nodeRes.statusCode = 404;
    nodeRes.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`MQR dev server running at http://localhost:${PORT}`);
});
