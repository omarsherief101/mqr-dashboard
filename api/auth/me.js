import { requireAuth } from '../../lib/auth.js';

export default async function handler(req, res) {
  const session = await requireAuth(req, res);
  if (!session) return;

  // Guard: email may be missing from very old tokens — fall back gracefully
  const email = session.email || '';
  const name  = session.name  || email.split('@')[0] || 'User';

  res.status(200).json({
    email,
    name,
    role: session.role || 'client',  // include role so frontend can use it
  });
}
