import pg from "pg";

const { Pool } = pg;

function redact(value, keepStart = 6, keepEnd = 4) {
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
    detail: e?.detail,
    where: e?.where,
    hint: e?.hint,
  };
}

function b64urlToUtf8(input) {
  const s = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Buffer.from(s + pad, "base64").toString("utf8");
}

function decodeJwtUnsafe(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return { looksJwt: false };
    const payload = JSON.parse(b64urlToUtf8(parts[1]));
    const issHost = payload?.iss ? (() => { try { return new URL(payload.iss).host; } catch { return null; } })() : null;
    return {
      looksJwt: true,
      role: payload?.role || payload?.user_role || null,
      iss: payload?.iss || null,
      issHost,
      exp: payload?.exp || null,
      iat: payload?.iat || null,
    };
  } catch {
    return { looksJwt: false };
  }
}

function loadOptionalCaPem() {
  // Optional escape hatch: allow providing a custom CA PEM via env.
  // Supabase uses a public CA-signed certificate; you typically do NOT need this.
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

function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: u.username,
    password: u.password,
    database: (u.pathname || "").replace(/^\//, "") || "postgres",
  };
}

function normalizeHttpUrl(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return "https://" + s;
}

function renderDiagnosticsUi(token) {
  // Minimal UI to avoid burning another Serverless Function on Vercel Hobby.
  // Access via /api/diagnostics-ui?token=... (rewrite → /api/diagnostics?ui=1&token=...)
  const safeToken = String(token || "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>UPMEME Diagnostics</title>
    <style>
      :root{--bg:#0b1020;--panel:#0f1733;--text:#e8ecff;--muted:#a9b3da;--line:rgba(255,255,255,.08);--shadow:0 20px 70px rgba(0,0,0,.35);--mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;--sans:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;}
      body{margin:0;background:radial-gradient(1200px 700px at 20% 0%, rgba(96,165,250,.12), transparent 60%),radial-gradient(900px 600px at 90% 10%, rgba(34,197,94,.10), transparent 55%),var(--bg);color:var(--text);font-family:var(--sans);}
      .wrap{max-width:1100px;margin:24px auto;padding:0 16px;}
      header{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;margin-bottom:12px;}
      h1{margin:0;font-size:18px;}
      .sub{margin-top:6px;color:var(--muted);font-size:12px;}
      button{border:1px solid var(--line);background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));color:var(--text);padding:10px 12px;border-radius:12px;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:13px;}
      button:hover{border-color:rgba(255,255,255,.18);}
      .card{background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);overflow:hidden;}
      .card .body{padding:14px;}
      pre{margin:0;padding:12px;border-radius:14px;border:1px solid var(--line);background:rgba(0,0,0,.20);color:var(--text);overflow:auto;font-size:12px;line-height:1.5;max-height:70vh;font-family:var(--mono);}
      .mono{font-family:var(--mono);}
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div>
          <h1>UPMEME Diagnostics</h1>
          <div class="sub">Reads <span class="mono">/api/diagnostics?token=…</span> and prints JSON (kept minimal to stay under Vercel Hobby function limit).</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
          <button id="refreshBtn">Refresh</button>
          <button id="copyBtn">Copy JSON</button>
        </div>
      </header>
      <div class="card"><div class="body"><pre id="out">Loading…</pre></div></div>
    </div>
    <script>
      const TOKEN = ${JSON.stringify(safeToken)};
      const out = document.getElementById('out');
      async function load(){
        out.textContent = 'Loading…';
        try{
          const r = await fetch('/api/diagnostics?token=' + encodeURIComponent(TOKEN), { cache: 'no-store' });
          const t = await r.text();
          try{ out.textContent = JSON.stringify(JSON.parse(t), null, 2); }
          catch{ out.textContent = t; }
        }catch(e){
          out.textContent = String(e && (e.stack || e.message) || e);
        }
      }
      document.getElementById('refreshBtn').onclick = load;
      document.getElementById('copyBtn').onclick = async () => {
        try{ await navigator.clipboard.writeText(out.textContent || ''); }catch{}
      };
      load();
    </script>
  </body>
</html>`;
}

async function pgCheck() {
  const DATABASE_URL = process.env.DATABASE_URL || "";
  if (!DATABASE_URL) {
    return { ok: false, error: { message: "DATABASE_URL is missing on this deployment" } };
  }

  let host = "";
  try {
    host = parseDbUrl(DATABASE_URL).host;
  } catch (e) {
    return { ok: false, error: { message: "DATABASE_URL is not a valid URL", detail: safeError(e) } };
  }

  let ca = null;
  try {
    ca = loadOptionalCaPem();
  } catch (e) {
    return { ok: false, error: { message: "Failed to load CA cert", detail: safeError(e) } };
  }

  const sslDisabled = String(process.env.PG_DISABLE_SSL || "").trim() === "1";
  const allowSelfSigned = String(process.env.PG_SSL_ALLOW_SELF_SIGNED || "").trim() === "1";
  const ssl = sslDisabled
    ? false
    : ca
      ? { ca, rejectUnauthorized: true, servername: host }
      : allowSelfSigned
        ? { rejectUnauthorized: false, servername: host }
        : { rejectUnauthorized: true, servername: host };

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const t0 = Date.now();
    await pool.query("select 1 as ok");
    const latencyMs = Date.now() - t0;

    // minimal schema checks (these are what your profile/comments features rely on)
    const checks = {};
    const reg1 = await pool.query(`select to_regclass('public.user_profiles') as reg`);
    checks.user_profiles = Boolean(reg1.rows?.[0]?.reg);

    const reg2 = await pool.query(`select to_regclass('public.token_comments') as reg`);
    checks.token_comments = Boolean(reg2.rows?.[0]?.reg);

    const reg3 = await pool.query(`select to_regclass('public.auth_nonces') as reg`);
    checks.auth_nonces = Boolean(reg3.rows?.[0]?.reg);

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

    return { ok: true, latencyMs, ssl: { hasCa: Boolean(ca), rejectUnauthorized: true }, checks };
  } catch (e) {
    return { ok: false, error: safeError(e), ssl: { hasCa: Boolean(ca) } };
  } finally {
    try { await pool.end(); } catch {}
  }
}

async function fetchJson(url, opts = {}) {
  const t0 = Date.now();
  const r = await fetch(url, { ...opts, cache: "no-store" });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return {
    ok: r.ok,
    status: r.status,
    latencyMs: Date.now() - t0,
    json,
    text: json ? null : text.slice(0, 300),
  };
}

async function checkRailway() {
  const baseRaw = process.env.RAILWAY_INDEXER_URL || "";
  if (!baseRaw) {
    return { ok: false, error: { message: "Missing RAILWAY_INDEXER_URL" } };
  }

  // Accept either:
  // - https://service.up.railway.app
  // - service.up.railway.app
  // - https://service.up.railway.app/health
  const base = normalizeHttpUrl(baseRaw).replace(/\/+$/, "");
  const url = base.endsWith("/health") ? base : base + "/health";

  try {
    const r = await fetchJson(url);
    const appOk = Boolean(r.json?.ok);
    return {
      ok: r.ok && appOk,
      latencyMs: r.latencyMs,
      url,
      httpStatus: r.status,
      body: r.json || r.text,
      note: baseRaw.startsWith("http") ? "" : "Tip: include https:// in RAILWAY_INDEXER_URL",
    };
  } catch (e) {
    return { ok: false, error: safeError(e), url };
  }
}

async function checkSupabasePublic() {
  // We only validate presence + basic URL sanity here (no secrets required).
  const url = process.env.SUPABASE_URL || "";
  if (!url) return { ok: false, error: { message: "Missing SUPABASE_URL" } };

  // Lightweight reachability: hit Supabase storage public endpoint root (should return 400/404 but reachable)
  const pingUrl = url.replace(/\/+$/, "") + "/rest/v1/";
  try {
    const t0 = Date.now();
    const r = await fetch(pingUrl, { method: "GET", cache: "no-store" });
    const latencyMs = Date.now() - t0;

    // Any response (even 401) confirms reachability from Vercel runtime
    return {
      ok: true,
      latencyMs,
      urlHost: (() => { try { return new URL(url).host; } catch { return "invalid"; } })(),
      pingUrl,
      httpStatus: r.status,
      note: "Reachability only (no service role key used).",
    };
  } catch (e) {
    return { ok: false, error: safeError(e), pingUrl };
  }
}

async function checkSupabaseServiceRole() {
  const baseUrl = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const bucket = process.env.SUPABASE_BUCKET || "UPMEME";

  const supaHost = (() => { try { return new URL(baseUrl).host; } catch { return null; } })();
  const jwt = decodeJwtUnsafe(key);
  const issuerMismatch = Boolean(jwt.looksJwt && jwt.issHost && supaHost && jwt.issHost !== supaHost);

  const jwtInfo = {
    looksJwt: jwt.looksJwt,
    role: jwt.role,
    issHost: jwt.issHost,
    supabaseHost: supaHost,
    issuerMismatch,
  };
  const headers = jwtInfo.looksJwt
  ? { Authorization: `Bearer ${key}`, apikey: key }   // legacy JWT keys
  : { apikey: key }; 

  if (!baseUrl || !key) {
    return {
      ok: false,
      skipped: true,
      error: { message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (required for /api/upload)" },
      bucket,
      jwt: jwtInfo,
    };
  }

  const url = baseUrl.replace(/\/+$/, "") + "/storage/v1/bucket";

  try {
    const t0 = Date.now();
    const r = await fetch(url, {
  method: "GET",
  headers,
  cache: "no-store",
});
    const latencyMs = Date.now() - t0;

    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    if (!r.ok) {
      return {
        ok: false,
        latencyMs,
        httpStatus: r.status,
        error: {
          message: "Supabase Storage API request failed",
          detail: json || text.slice(0, 400),
        },
        bucket,
        url,
        jwt: jwtInfo,              // <-- add here (failure path)
      };
    }

    const buckets = Array.isArray(json) ? json : [];
    const bucketExists = buckets.some((b) => b?.name === bucket);

    return {
      ok: true,
      latencyMs,
      httpStatus: r.status,
      url,
      bucket: { name: bucket, exists: bucketExists, total: buckets.length },
      jwt: jwtInfo,                // <-- add here (success path)
    };
  } catch (e) {
    return {
      ok: false,
      error: safeError(e),
      bucket,
      url,
      jwt: jwtInfo,                // <-- optional but recommended
    };
  }
}


async function checkAblyServerKey() {
  // Ably server key must NOT be exposed to browser; check server-side env only
  const key = process.env.ABLY_API_KEY || "";
  if (!key) return { ok: false, error: { message: "Missing ABLY_API_KEY (server-side)" } };

  // Validate format without revealing it: should contain ":" (keyName:keySecret)
  const looksValid = key.includes(":") && key.length >= 20;
  return {
    ok: looksValid,
    looksValid,
    preview: redact(key, 10, 6),
    note: looksValid
      ? "Server key present and format looks valid."
      : "ABLY_API_KEY present but format does not look like keyName:keySecret.",
  };
}

export default async function handler(req, res) {
  try {
    const want = String(process.env.DIAGNOSTICS_TOKEN || "");
    const got = String(req.query?.token || "");

    // Hide endpoint if not authorized
    if (!want || got !== want) {
      return res.status(404).json({ error: "Not found" });
    }

    // Serve UI from the same function (Vercel Hobby has a strict function-count limit)
    if (String(req.query?.ui || "") === "1") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(renderDiagnosticsUi(got));
      return;
    }

    const out = {
      ok: false,
      runtime: {
        nodeEnv: process.env.NODE_ENV || "",
      },
      env_presence: {
        DATABASE_URL: Boolean(process.env.DATABASE_URL),
        PG_CA_CERT_B64: Boolean(process.env.PG_CA_CERT_B64),
        PG_CA_CERT: Boolean(process.env.PG_CA_CERT),
        PG_DISABLE_SSL: Boolean(process.env.PG_DISABLE_SSL),
        SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        // Ably: server side should have ABLY_API_KEY (do not expose it)
        ABLY_API_KEY: Boolean(process.env.ABLY_API_KEY),
        // Client side uses VITE_ABLY_CLIENT_KEY at build time; may be absent here
        VITE_ABLY_CLIENT_KEY_on_server: Boolean(process.env.VITE_ABLY_CLIENT_KEY),
        RAILWAY_INDEXER_URL: Boolean(process.env.RAILWAY_INDEXER_URL),
      },
      redacted: {
        // helpful to verify you're pointing to the expected Postgres without leaking secrets
        DATABASE_URL_host: process.env.DATABASE_URL ? (() => {
          try { return parseDbUrl(process.env.DATABASE_URL).host; } catch { return "invalid"; }
        })() : "",
        ABLY_API_KEY_preview: process.env.ABLY_API_KEY ? redact(process.env.ABLY_API_KEY, 10, 6) : "",
      },
      checks: {},
      recommendations: [],
    };

    // DATABASE_URL should point at Supabase Postgres (single source of truth)
    out.checks.supabase_postgres = await pgCheck();

    // Railway (indexer health)
out.checks.railway = await checkRailway();

// Supabase (reachability only; token data lives here)
out.checks.supabase = await checkSupabasePublic();

out.checks.supabase_service_role = await checkSupabaseServiceRole();

const sr = out.checks.supabase_service_role;
if (sr && sr.jwt?.issuerMismatch) {
  out.recommendations.push(
    "SUPABASE_SERVICE_ROLE_KEY issuer does not match SUPABASE_URL host. You likely pasted a key from a different Supabase project. Copy the service_role key from the SAME project as SUPABASE_URL."
  );
}
if (sr && sr.jwt?.looksJwt && sr.jwt?.role && String(sr.jwt.role).toLowerCase() !== "service_role") {
  out.recommendations.push(
    "SUPABASE_SERVICE_ROLE_KEY JWT role is not service_role. Ensure you copied the service_role key (not anon) from Supabase Settings → API."
  );
}

if (!out.checks.supabase_service_role?.ok) {
  out.recommendations.push(
    "Supabase service role key is missing/invalid. This will break /api/upload. Set SUPABASE_SERVICE_ROLE_KEY on Vercel."
  );
}

// Ably (server key presence/format only)
out.checks.ably = await checkAblyServerKey();

if (!out.checks.railway?.ok) {
  out.recommendations.push(
    "Railway /health is failing or unreachable. Set RAILWAY_INDEXER_URL on Vercel and confirm the indexer can connect to Supabase Postgres."
  );
}

if (!out.checks.supabase?.ok) {
  out.recommendations.push(
    "Supabase reachability failed. Verify SUPABASE_URL on Vercel."
  );
}

if (!out.checks.ably?.ok) {
  out.recommendations.push(
    "Ably server key is missing/invalid on Vercel. Set ABLY_API_KEY (keyName:keySecret). Client-side should not use the server key."
  );
}
    if (!out.checks.supabase_postgres.ok) {
      out.recommendations.push(
        "Postgres DB check failed. Look at checks.supabase_postgres.error for the exact TLS/auth/host issue."
      );
      if (!out.env_presence.DATABASE_URL) {
        out.recommendations.push(
          "DATABASE_URL is missing on Vercel Production env. Add it and redeploy."
        );
      }
    } else {
      const c = out.checks.supabase_postgres.checks || {};
      if (!c.user_profiles) out.recommendations.push("Missing table user_profiles. Apply db/migrations/002_social.sql.");
      if (!c.token_comments) out.recommendations.push("Missing table token_comments. Apply db/migrations/002_social.sql.");
      if (c.auth_nonces && !c.auth_nonces_used_at) {
        out.recommendations.push(
          "auth_nonces.used_at column is missing but your API expects it. Add the column or update the queries/migration."
        );
      }
    }

    const gates = {
      core: [
        { name: "Supabase Postgres (DATABASE_URL)", ok: Boolean(out.checks.supabase_postgres?.ok) },
        { name: "Supabase reachability (REST)", ok: Boolean(out.checks.supabase?.ok) },
      ],
      goLive: [
        { name: "Supabase Postgres (DATABASE_URL)", ok: Boolean(out.checks.supabase_postgres?.ok) },
        { name: "Railway indexer /health", ok: Boolean(out.checks.railway?.ok) },
        { name: "Supabase reachability", ok: Boolean(out.checks.supabase?.ok) },
        { name: "Supabase service role (uploads)", ok: Boolean(out.checks.supabase_service_role?.ok) },
        { name: "Ably server key", ok: Boolean(out.checks.ably?.ok) },
      ],
    };

    out.status = {
      coreReady: gates.core.every((g) => g.ok),
      goLiveReady: gates.goLive.every((g) => g.ok),
      gates,
    };

    out.ok = out.status.coreReady;

    return res.status(200).json(out);
  } catch (e) {
    console.error("[api/diagnostics] crashed", e);
    return res.status(500).json({ error: "Server error", detail: safeError(e) });
  }
}
