import fs from 'fs';
import path from 'path';

// Serves index.html with the Clerk publishable key injected
export default function handler(req, res) {
  const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
  const filePath = path.join(process.cwd(), 'index.html');

  let html;
  try {
    html = fs.readFileSync(filePath, 'utf8');
  } catch {
    return res.status(500).send('Dashboard not found');
  }

  // Inject publishable key
  const injected = html.replace(
    "const CLERK_PK = window.__CLERK_PK__ || '';",
    `const CLERK_PK = '${pk}';`
  );

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(injected);
}
