import { json, badMethod } from "./_http.js";

function getBearerToken(req) {
  const h = String(req.headers?.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  const expected = String(process.env.STATUS_TOKEN || "").trim();
  if (!expected) {
    return json(res, 500, { error: "STATUS_TOKEN is not configured" });
  }

  const token = getBearerToken(req) || String(req.query?.token || "").trim();
  if (!token || token !== expected) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const url = String(process.env.TELEMETRY_STATUS_URL || "").trim();
  if (!url) {
    return json(res, 500, { error: "TELEMETRY_STATUS_URL is not configured" });
  }

  try {
    const r = await fetch(url, {
      headers: {
        "accept": "application/json",
      },
    });

    const txt = await r.text();
    if (!r.ok) {
      return json(res, 502, { error: "Telemetry upstream error", status: r.status, body: txt.slice(0, 500) });
    }

    // Private endpoint: don't cache in browsers.
    res.setHeader("cache-control", "no-store");
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(txt);
  } catch (e) {
    return json(res, 502, { error: "Telemetry fetch failed", message: String(e?.message || e) });
  }
}
