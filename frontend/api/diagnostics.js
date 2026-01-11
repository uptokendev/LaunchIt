import { pool } from "./_db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

function nowMs() {
  return Date.now();
}

function redact(value, keepStart = 4, keepEnd = 4) {
  const s = String(value ?? "");
  if (!s) return "";
  if (s.length <= keepStart + keepEnd) return "*".repeat(s.length);
  return `${s.slice(0, keepStart)}…${s.slice(-keepEnd)}`;
}

function safeError(e) {
  return {
    name: e?.name || "Error",
    message: String(e?.message || e),
    code: e?.code,
  };
}

function getRepoCaInfo() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const p = path.join(__dirname, "certs", "aiven-ca.pem");
    const exists = fs.existsSync(p);
    const bytes = exists ? fs.statSync(p).size : 0;
    return { exists, bytes };
  } catch {
    return { exists: false, bytes: 0 };
  }
}

function parseDbUrlRedacted(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 5432,
      database: (u.pathname || "").replace(/^\//, "") || "postgres",
      user: u.username ? redact(decodeURIComponent(u.username)) : "",
      // do NOT expose password
    };
  } catch {
    return null;
  }
}

async function checkAivenDb() {
  const t0 = nowMs();
  // 1) basic connectivity
  await pool.query("select 1 as ok");
  const latencyMs = nowMs() - t0;

  // 2) schema sanity (tables/columns your API expects)
  const checks = {};

  // user_profiles table exists?
  const up = await pool.query(`select to_regclass('public.user_profiles') as reg`);
  checks.user_profiles = Boolean(up.rows?.[0]?.reg);

  // auth_nonces table exists?
  const an = await pool.query(`select to_regclass('public.auth_nonces') as reg`);
  checks.auth_nonces = Boolean(an.rows?.[0]?.reg);

  // used_at column exists? (your profile API SELECTs used_at)
  if (checks.auth_nonces) {
    const cols = await pool.query(
      `select column_name
       from information_schema.columns
       where table_schema='public' and table_name='auth_nonces'`
    );
    const names = new Set((cols.rows || []).map((r) => String(r.column_name)));
    checks.auth_nonces_used_at = names.has("used_at");
    checks.auth_nonces_expires_at = names.has("expires_at");
    checks.auth_nonces_nonce = names.has("nonce");
  }

  return { ok: true, latencyMs, checks };
}

async function checkSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || "upmeme";

  if (!url || !key) {
    return {
      ok: false,
      error: { message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
    };
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Try a lightweight storage call
  const t0 = nowMs();
  const { data, error } = await supabase.storage.listBuckets();
  const latencyMs = nowMs() - t0;

  if (error) return { ok: false, latencyMs, error: safeError(error) };

  const bucketExists = Array.isArray(data) && data.some((b) => b?.name === bucket);
  return { ok: true, latencyMs, bucket: { name: bucket, exists: bucketExists, total: data?.length ?? 0 } };
}

export default async function handler(req, res) {
  try {
    // Simple protection: require a token so this isn’t public
    const want = String(process.env.DIAGNOSTICS_TOKEN || "");
    const got = String(req.query?.token || "");

    // Return 404 on failure to avoid advertising the endpoint
    if (!want || got !== want) {
      return res.status(404).json({ error: "Not found" });
    }

    const repoCa = getRepoCaInfo();
    const dbUrl = process.env.DATABASE_URL || "";
    const dbInfo = dbUrl ? parseDbUrlRedacted(dbUrl) : null;

    const out = {
      ok: false,
      runtime: {
        nodeEnv: process.env.NODE_ENV || "",
      },
      env: {
        DATABASE_URL: Boolean(dbUrl),
        DATABASE_URL_info: dbInfo,
        PG_CA_CERT_B64: Boolean(process.env.PG_CA_CERT_B64),
        PG_CA_CERT: Boolean(process.env.PG_CA_CERT),
        repo_aiven_ca_pem: repoCa,
        SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        SUPABASE_BUCKET: process.env.SUPABASE_BUCKET || "upmeme",
        // Ably client key is a Vite build-time var; may not exist on server runtime
        VITE_ABLY_CLIENT_KEY_on_server: Boolean(process.env.VITE_ABLY_CLIENT_KEY),
      },
      checks: {},
      recommendations: [],
    };

    // Aiven DB check
    try {
      out.checks.aivenDb = await checkAivenDb();
    } catch (e) {
      out.checks.aivenDb = { ok: false, error: safeError(e) };
      out.recommendations.push(
        "Aiven DB connection failed from Vercel. Verify DATABASE_URL points to Aiven, and the Aiven CA cert used by frontend/api/_db.js matches your Aiven instance."
      );
    }

    // If schema mismatch is detected, point to it explicitly
    if (out.checks.aivenDb?.ok) {
      const c = out.checks.aivenDb.checks || {};
      if (!c.user_profiles) {
        out.recommendations.push("Table user_profiles is missing. Apply db/migrations/002_social.sql to Aiven.");
      }
      if (!c.auth_nonces) {
        out.recommendations.push("Table auth_nonces is missing. Apply db/migrations/002_social.sql to Aiven.");
      } else if (!c.auth_nonces_used_at) {
        out.recommendations.push(
          "Column auth_nonces.used_at is missing but the profile API expects it. Update the migration or run an ALTER TABLE to add used_at."
        );
      }
    }

    // Supabase check (used by api/upload.js)
    try {
      out.checks.supabase = await checkSupabase();
    } catch (e) {
      out.checks.supabase = { ok: false, error: safeError(e) };
      out.recommendations.push("Supabase connectivity failed. Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.");
    }

    out.ok = Boolean(out.checks.aivenDb?.ok) && Boolean(out.checks.supabase?.ok);
    return res.status(200).json(out);
  } catch (e) {
    console.error("[api/diagnostics]", e);
    return res.status(500).json({ error: "Server error", detail: safeError(e) });
  }
}