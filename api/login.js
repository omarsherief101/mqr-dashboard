import fs from 'fs';
import path from 'path';

// Serves login.html with the Clerk publishable key injected
export default function handler(req, res) {
  const pk = process.env.CLERK_PUBLISHABLE_KEY || '';
  const filePath = path.join(process.cwd(), 'login.html');

  let html;
  try {
    html = fs.readFileSync(filePath, 'utf8');
  } catch {
    return res.status(500).send('Login page not found');
  }

  // Inject publishable key as a script variable before </head>
  const injected = html.replace(
    "const PUBLISHABLE_KEY = window.__CLERK_PUBLISHABLE_KEY__ || '';",
    `const PUBLISHABLE_KEY = '${pk}';`
  );

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(injected);
}
