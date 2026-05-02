import { signToken, sessionCookie } from '../../lib/auth.js';
import { sql, ensureSchema } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  try {
    await ensureSchema();
    const rows = await sql()(
      `SELECT * FROM users WHERE LOWER(email) = LOWER(${email.trim()}) AND password = ${password} LIMIT 1`
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken({ email: user.email, name: user.name });
    res.setHeader('Set-Cookie', sessionCookie(token));
    res.status(200).json({ ok: true, name: user.name });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error, please try again' });
  }
}
