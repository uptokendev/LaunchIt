import pg from "pg";
import fs from "fs";
import path from "path";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

function loadCaFromRepo() {
  try {
    // Vercel functions run from /var/task, and your repo is bundled there.
    // We build a path relative to THIS FILE.
    const caPath = path.join(path.dirname(new URL(import.meta.url).pathname), "certs", "aiven-ca.pem");
    return fs.readFileSync(caPath, "utf8");
  } catch (e) {
    console.error("[api/_db] Failed to read CA cert from repo:", e);
    return null;
  }
}

if (!DATABASE_URL) {
  console.error("[api/_db] Missing DATABASE_URL env var");
}

let _pool = globalThis.__upmeme_pool;

if (!_pool && DATABASE_URL) {
  const ca = loadCaFromRepo();
  if (!ca) throw new Error("Aiven CA cert missing: frontend/api/certs/aiven-ca.pem");

  _pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { ca, rejectUnauthorized: true },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  globalThis.__upmeme_pool = _pool;

  _pool.on("error", (err) => console.error("[api/_db] Pool error", err));
}

export const pool = _pool;
