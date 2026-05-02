import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const filePath = path.join(process.cwd(), 'login.html');
  let html;
  try {
    html = fs.readFileSync(filePath, 'utf8');
  } catch {
    return res.status(500).send('Login page not found');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}
