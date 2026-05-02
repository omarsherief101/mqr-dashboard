import { createClerkClient, verifyToken } from '@clerk/backend';

// ── Clerk client (server-side) ────────────────────────────────
function clerk() {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error('CLERK_SECRET_KEY is not set');
  return createClerkClient({ secretKey: key });
}

// ── Extract Bearer token from request ─────────────────────────
function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  // Also accept cookie (Clerk sets __session)
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  return match ? match[1] : null;
}

// ── Verify session + return { userId, role } ──────────────────
// Role is stored in Clerk publicMetadata: { role: 'admin' | 'client' }
// Default for new users with no role set: 'client'
export async function getSession(req) {
  const token = extractToken(req);
  if (!token) return null;

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    // Fetch full user to get publicMetadata.role
    const user = await clerk().users.getUser(payload.sub);
    const role = user.publicMetadata?.role || 'client';

    return { userId: payload.sub, role, user };
  } catch {
    return null;
  }
}

// ── Middleware: require valid session or return 401 ────────────
// Usage in API handler:
//   const session = await requireAuth(req, res);
//   if (!session) return;  // already sent 401
export async function requireAuth(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Unauthorized — please sign in' });
    return null;
  }
  return session;
}

// ── Middleware: require admin role or return 403 ───────────────
export async function requireAdmin(req, res) {
  const session = await requireAuth(req, res);
  if (!session) return null;
  if (session.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden — admin access required' });
    return null;
  }
  return session;
}

// ── Role capability checks ─────────────────────────────────────
export const CAPS = {
  // What each role can see
  admin: {
    metaDiagnostics: true,   // raw Meta API diagnostics
    spendNumbers:    true,   // all spend figures
    allSections:     true,   // every dashboard section
    exportData:      true,   // future: CSV export
  },
  client: {
    metaDiagnostics: false,
    spendNumbers:    true,   // clients can see spend
    allSections:     true,
    exportData:      false,
  },
  viewer: {
    metaDiagnostics: false,
    spendNumbers:    false,  // hide spend from viewers
    allSections:     false,  // KPIs + funnel only
    exportData:      false,
  },
};

export function caps(role) {
  return CAPS[role] || CAPS.client;
}
