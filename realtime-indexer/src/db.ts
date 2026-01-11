import { Pool } from "pg";
import { ENV } from "./env.js";

function loadCaPem(): string | null {
  // 1) Base64 env var (best on Railway)
  const b64 = process.env.PG_CA_CERT_B64;
  if (b64) {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    if (pem.includes("BEGIN CERTIFICATE")) return pem;
    throw new Error("PG_CA_CERT_B64 does not decode to a PEM certificate");
  }

  // 2) Plain PEM env var (supports \n)
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
  ca = loadCaPem();
} catch (e) {
  // If CA loading itself fails, surface it clearly (so /health shows a useful message)
  console.error("[db] CA load error:", e);
  ca = null;
}

export const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
  ssl: ca
    ? { ca, rejectUnauthorized: true, servername: host }
    : { rejectUnauthorized: false, servername: host },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});
