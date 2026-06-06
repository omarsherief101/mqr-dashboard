import { neon } from '@neondatabase/serverless';

// ── Lazy-resolve DB URL — throws at call time, NOT at module import time ──
function getUrl() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL;

  if (!url) {
    const keys = Object.keys(process.env)
      .filter(k => k.includes('POSTGRES') || k.includes('DATABASE') || k.includes('NEON'));
    throw new Error(`No DB connection string found. Available keys: ${keys.join(', ') || 'none'}`);
  }
  return url;
}

// Memoize the neon client — one per warm instance
let _sql = null;
function getSql() {
  if (!_sql) _sql = neon(getUrl());
  return _sql;
}

// ── sql tagged-template proxy ──────────────────────────────────────────────
// The Proxy TARGET must be a function so that `sql\`...\`` (tagged template)
// works — JavaScript only triggers the `apply` trap when the target is callable.
export const sql = new Proxy(function () {}, {
  // sql`SELECT ...` → tagged template literal → apply trap
  apply(_target, _thisArg, args) {
    return getSql()(...args);
  },
  // sql.transaction, sql.begin, etc. → property access trap
  get(_target, prop) {
    return getSql()[prop];
  },
});

// Schema run-once guard — only executes CREATE TABLE once per warm process
let schemaEnsured = false;
export async function ensureSchema() {
  if (schemaEnsured) return;
  const db = getSql();
  await db`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      role       TEXT NOT NULL DEFAULT 'client',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Migration: add role column to pre-existing tables that lack it
  await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client'`;
  schemaEnsured = true;
}
