import { requireAdmin } from '../../lib/auth.js';
import { sql, ensureSchema } from '../../lib/db.js';

export default async function handler(req, res) {
  // ── Admin-only guard ──────────────────────────────────────────
  const session = await requireAdmin(req, res);
  if (!session) return;

  // ── Ensure DB schema exists ───────────────────────────────────
  try {
    await ensureSchema();
  } catch (err) {
    console.error('[admin/users] ensureSchema failed:', err.message);
    return res.status(503).json({ error: 'Database unavailable, please try again shortly' });
  }

  // ── GET — list all users ──────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC`;
      return res.status(200).json({ users: rows });
    } catch (err) {
      console.error('[admin/users] GET failed:', err.message);
      return res.status(503).json({ error: 'Could not fetch users — database error' });
    }
  }

  // ── POST — create user ────────────────────────────────────────
  if (req.method === 'POST') {
    const { email, password, name, role } = req.body || {};
    if (!email || !password || !name)
      return res.status(400).json({ error: 'Email, password and name are required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return res.status(400).json({ error: 'Invalid email address' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const validRoles = ['admin', 'client', 'viewer'];
    const userRole = validRoles.includes(role) ? role : 'client';

    try {
      await sql`
        INSERT INTO users (email, password, name, role)
        VALUES (${email.trim().toLowerCase()}, ${password}, ${name.trim()}, ${userRole})
      `;
      return res.status(201).json({ ok: true });
    } catch (err) {
      if (err.message?.includes('unique') || err.message?.includes('duplicate'))
        return res.status(409).json({ error: 'A user with this email already exists' });
      console.error('[admin/users] POST failed:', err.message);
      return res.status(503).json({ error: 'Could not create user — database error' });
    }
  }

  // ── DELETE — remove user ──────────────────────────────────────
  if (req.method === 'DELETE') {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (email.toLowerCase() === session.email.toLowerCase())
      return res.status(400).json({ error: 'You cannot delete your own account' });
    try {
      await sql`DELETE FROM users WHERE LOWER(email) = LOWER(${email})`;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[admin/users] DELETE failed:', err.message);
      return res.status(503).json({ error: 'Could not delete user — database error' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
