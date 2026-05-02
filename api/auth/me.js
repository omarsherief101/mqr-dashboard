import { requireAuth } from '../../lib/auth.js';

export default async function handler(req, res) {
  const session = await requireAuth(req, res);
  if (!session) return;

  res.status(200).json({
    email: session.email,
    name:  session.name || session.email.split('@')[0],
  });
}
