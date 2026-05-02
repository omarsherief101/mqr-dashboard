import { requireAuth, caps } from '../../lib/auth.js';

export default async function handler(req, res) {
  const session = await requireAuth(req, res);
  if (!session) return;

  const { userId, role, user } = session;

  res.status(200).json({
    userId,
    role,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.emailAddresses[0]?.emailAddress || 'User',
    email: user.emailAddresses[0]?.emailAddress || '',
    imageUrl: user.imageUrl || null,
    capabilities: caps(role),
  });
}
