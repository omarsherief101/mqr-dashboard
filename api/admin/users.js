import { requireAuth } from '../../lib/auth.js';
import { sql, ensureSchema } from '../../lib/db.js';

export default async function handler(req, res) {
  const session = await requireAuth(req, res);
  if (!session) return;

  await ensureSchema();

  if (req.method === 'GET') {
    const rows = await sql`SELECT id, email, name, created_at FROM users ORDER BY created_at ASC`;
    return res.status(200).json({ users: rows });
  }

  if (req.method === 'POST') {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name)
      return res.status(400).json({ error: 'Email, password and name are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    try {
      await sql`INSERT INTO users (email, password, name) VALUES (${email.trim().toLowerCase()}, ${password}, ${name.trim()})`;
      return res.status(201).json({ ok: true });
    } catch (err) {
      if (err.message?.includes('unique') || err.message?.includes('duplicate'))
        return res.status(409).json({ error: 'A user with this email already exists' });
      throw err;
    }
  }

  if (req.method === 'DELETE') {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (email.toLowerCase() === session.email.toLowerCase())
      return res.status(400).json({ error: 'You cannot delete your own account' });
    await sql`DELETE FROM users WHERE LOWER(email) = LOWER(${email})`;
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
