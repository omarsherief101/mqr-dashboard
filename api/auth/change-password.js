import { requireAuth, getUsers } from '../../lib/auth.js';

const PROJECT_ID = 'prj_69CTXRhLcwcCFTrVMSupBtg0ANVJ';
const TEAM_ID    = 'team_rMnYkeHxkOCfpyBoI79oe7wp';

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

  const users = getUsers();
  const userIndex = users.findIndex(
    u => u.email.toLowerCase() === session.email.toLowerCase() && u.password === currentPassword
  );
  if (userIndex === -1)
    return res.status(401).json({ error: 'Current password is incorrect' });

  const token = process.env.VERCEL_TOKEN;
  if (!token)
    return res.status(500).json({ error: 'Password change not configured — VERCEL_TOKEN missing' });

  // Update password in the array
  users[userIndex].password = newPassword;
  const newJson = JSON.stringify(users);

  try {
    // 1. Find the env var ID for USERS_JSON
    const listRes = await fetch(
      `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!listRes.ok) throw new Error(`Vercel list env failed: ${listRes.status}`);
    const listData = await listRes.json();
    const envVar = (listData.envs || []).find(e => e.key === 'USERS_JSON');
    if (!envVar) throw new Error('USERS_JSON env var not found in project');

    // 2. Patch it with the new value
    const patchRes = await fetch(
      `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${envVar.id}?teamId=${TEAM_ID}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: newJson }),
      }
    );
    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Vercel patch failed: ${patchRes.status}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('change-password error:', err);
    res.status(500).json({ error: err.message || 'Failed to update password' });
  }
}
