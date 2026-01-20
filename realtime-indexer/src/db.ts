import { Pool } from "pg";
import { ENV } from "./env.js";

/**
 * Standardize on Supabase Postgres.
 *
 * Notes:
 * - Supabase uses a public CA-signed certificate; you typically do NOT need to provide a custom CA.
 * - In hosted environments (Railway), keep TLS enabled and rejectUnauthorized=true.
 * - For local dev against a local Postgres, you can disable TLS by setting PG_DISABLE_SSL=1.
 */

function loadOptionalCaPem(): string | null {
  // Optional escape hatch: allow providing a custom CA PEM via env
  // (useful if you ever point at a Postgres that requires it).
  const b64 = process.env.PG_CA_CERT_B64;
  if (b64) {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    if (pem.includes("BEGIN CERTIFICATE")) return pem;
    throw new Error("PG_CA_CERT_B64 does not decode to a PEM certificate");
  }
  const pem = process.env.PG_CA_CERT;
  if (pem) return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  return null;
}

function dbHostFromUrl(dbUrl: string): string {
  const u = new URL(dbUrl);
  return u.hostname;
}

const host = dbHostFromUrl(ENV.DATABASE_URL);

let ca: string | null = null;
try {
  ca = loadOptionalCaPem();
} catch (e) {
  console.error("[db] CA load error:", e);
  ca = null;
}

const sslDisabled = String(process.env.PG_DISABLE_SSL || "").trim() === "1";

export const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
  ssl: sslDisabled
    ? false
    : ca
      ? { ca, rejectUnauthorized: true, servername: host }
      : { rejectUnauthorized: true, servername: host },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});
