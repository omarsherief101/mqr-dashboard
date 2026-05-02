// One-time setup endpoint — seeds initial users from USERS_JSON env var into Neon DB
// Call once: GET /api/admin/setup?secret=<SETUP_SECRET>
import { sql, ensureSchema } from '../../lib/db.js';

export default async function handler(req, res) {
  // Protect with a simple secret
  const secret = process.env.SETUP_SECRET || 'mqr-setup-2026';
  if (req.query.secret !== secret) return res.status(403).json({ error: 'Forbidden' });

  try {
    await ensureSchema();

    // Migrate users from USERS_JSON if present
    const usersJson = process.env.USERS_JSON;
    let migrated = 0;
    if (usersJson) {
      const users = JSON.parse(usersJson);
      for (const u of users) {
        try {
          await sql()(
            `INSERT INTO users (email, password, name)
             VALUES (${u.email.toLowerCase()}, ${u.password}, ${u.name || u.email.split('@')[0]})
             ON CONFLICT (email) DO NOTHING`
          );
          migrated++;
        } catch (e) { console.warn('Skip user:', u.email, e.message); }
      }
    }

    // Show current users
    const rows = await sql()(`SELECT id, email, name, created_at FROM users ORDER BY id`);
    res.status(200).json({ ok: true, migrated, users: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
