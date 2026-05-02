import { getUsers, signToken, sessionCookie, caps } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const users = getUsers();
  const user  = users.find(
    u => u.email.toLowerCase() === email.toLowerCase().trim()
      && u.password === password
  );

  if (!user) {
    // Generic message — don't reveal whether email exists
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken({
    email: user.email,
    role:  user.role  || 'client',
    name:  user.name  || '',
  });

  res.setHeader('Set-Cookie', sessionCookie(token));
  res.status(200).json({
    ok:           true,
    role:         user.role,
    name:         user.name || '',
    capabilities: caps(user.role),
  });
}
