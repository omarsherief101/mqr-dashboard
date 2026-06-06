/**
 * GET /api/admin/promote?secret=SETUP_SECRET&email=EMAIL
 * One-time endpoint — sets a user's role to 'admin'.
 * Protected by the same SETUP_SECRET env var as /api/admin/setup.
 */
import { sql, ensureSchema } from '../../lib/db.js';

export default async function handler(req, res) {
  const secret = process.env.SETUP_SECRET;
  if (!secret || req.query.secret !== secret) {
    return res.status(403).json({ error: 'Forbidden — invalid secret' });
  }

  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email query param required' });

  try {
    await ensureSchema();
    const result = await sql`
      UPDATE users SET role = 'admin'
      WHERE LOWER(email) = ${email}
      RETURNING id, email, name, role
    `;
    if (result.length === 0) {
      return res.status(404).json({ error: `No user found with email: ${email}` });
    }
    return res.status(200).json({ ok: true, user: result[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
