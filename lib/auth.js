import crypto from 'crypto';

// ── JWT (pure Node.js — no dependencies) ──────────────────────
const JWT_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

export function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', jwtSecret())
    .update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  try {
    const parts = (token || '').split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto.createHmac('sha256', jwtSecret())
      .update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── Extract token from cookie or Authorization header ─────────
function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const cookies = req.headers.cookie || '';
  const m = cookies.match(/(?:^|;\s*)__session=([^;]+)/);
  return m ? m[1] : null;
}

// ── Middleware ─────────────────────────────────────────────────
export async function requireAuth(req, res) {
  const token   = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized — please sign in' });
    return null;
  }
  return payload; // { email, role, name, iat, exp }
}

export async function requireAdmin(req, res) {
  const session = await requireAuth(req, res);
  if (!session) return null;
  if (session.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden — admin access required' });
    return null;
  }
  return session;
}

// ── Users from env ─────────────────────────────────────────────
// USERS_JSON = '[{"email":"you@co.com","password":"pass","role":"admin","name":"Omar"}]'
export function getUsers() {
  try { return JSON.parse(process.env.USERS_JSON || '[]'); }
  catch { return []; }
}

// ── Role capability map ────────────────────────────────────────
export const CAPS = {
  admin:  { metaDiagnostics: true,  spendNumbers: true,  allSections: true,  exportData: true  },
  client: { metaDiagnostics: false, spendNumbers: true,  allSections: true,  exportData: false },
  viewer: { metaDiagnostics: false, spendNumbers: false, allSections: false, exportData: false },
};

export function caps(role) { return CAPS[role] || CAPS.client; }

// ── Cookie helper ──────────────────────────────────────────────
export function sessionCookie(token) {
  const secure = process.env.NODE_ENV !== 'development' ? '; Secure' : '';
  return `__session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${JWT_EXPIRY}${secure}`;
}

export function clearCookie() {
  return '__session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}
