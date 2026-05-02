import { requireAuth } from '../../lib/auth.js';
import { sql, ensureSchema } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await requireAuth(req, res);
  if (!session) return;

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both current and new password are required' });
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  if (currentPassword === newPassword)
    return res.status(400).json({ error: 'New password must be different from current' });

  try {
    await ensureSchema();
    const rows = await sql`
      SELECT id FROM users
      WHERE LOWER(email) = LOWER(${session.email}) AND password = ${currentPassword}
      LIMIT 1
    `;
    if (!rows[0]) return res.status(401).json({ error: 'Current password is incorrect' });

    await sql`UPDATE users SET password = ${newPassword} WHERE LOWER(email) = LOWER(${session.email})`;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('change-password error:', err);
    res.status(500).json({ error: 'Server error, please try again' });
  }
}
