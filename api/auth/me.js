import { requireAuth, caps } from '../../lib/auth.js';

export default async function handler(req, res) {
  const session = await requireAuth(req, res);
  if (!session) return;

  res.status(200).json({
    email:        session.email,
    role:         session.role,
    name:         session.name || session.email.split('@')[0],
    capabilities: caps(session.role),
  });
}
