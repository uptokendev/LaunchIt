import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

const CATEGORY_SET = new Set(["straight_up", "fastest_graduation", "largest_buy"]);
const PERIOD_SET = new Set(["weekly", "monthly", "all", "all_time", "alltime"]);

function clampInt(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function periodCutoff(period) {
  const p = String(period || "weekly").toLowerCase();
  if (p === "weekly") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (p === "monthly") return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return null; // all-time
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 97);
    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });

    const category = String(q.category ?? "").toLowerCase().trim();
    if (!CATEGORY_SET.has(category)) return json(res, 400, { error: "Invalid category" });

    const periodRaw = String(q.period ?? "weekly").toLowerCase().trim();
    if (!PERIOD_SET.has(periodRaw)) return json(res, 400, { error: "Invalid period" });

    const cutoff = periodCutoff(periodRaw);
    const limit = clampInt(q.limit ?? 10, 1, 50, 10);

    // IMPORTANT: These leaderboards depend on the following columns on public.campaigns:
    // created_block (already in 003_indexer.sql), is_active (already in 003_indexer.sql),
    // plus: created_at_chain, graduated_block, graduated_at_chain, fee_recipient_address.
    //
    // If your DB is missing these, the handler will return { items: [] } instead of crashing.

    if (category === "fastest_graduation") {
      const params = [chainId, limit];
      let whereCutoff = "";
      if (cutoff) {
        params.push(cutoff.toISOString());
        whereCutoff = `AND c.graduated_at_chain >= $3::timestamptz`;
      }

      const { rows } = await pool.query(
        `
        WITH grads AS (
          SELECT
            c.chain_id,
            c.campaign_address,
            c.name,
            c.symbol,
            c.logo_uri,
            c.creator_address,
            c.created_at_chain,
            c.graduated_at_chain,
            c.created_block,
            c.graduated_block,
            EXTRACT(EPOCH FROM (c.graduated_at_chain - c.created_at_chain))::bigint AS seconds_to_graduate,
            (
              SELECT COUNT(DISTINCT t.wallet)
              FROM curve_trades t
              WHERE t.chain_id = c.chain_id
                AND t.campaign_address = c.campaign_address
                AND t.side = 'buy'
                AND t.block_number >= c.created_block
                AND (c.graduated_block IS NULL OR c.graduated_block = 0 OR t.block_number <= c.graduated_block)
            ) AS unique_buyers
          FROM campaigns c
          WHERE c.chain_id = $1
            AND c.created_at_chain IS NOT NULL
            AND c.graduated_at_chain IS NOT NULL
            AND (c.graduated_block IS NOT NULL AND c.graduated_block > 0)
            ${whereCutoff}
        )
        SELECT *
        FROM grads
        WHERE unique_buyers >= 25
        ORDER BY seconds_to_graduate ASC NULLS LAST
        LIMIT $2
        `,
        params
      );

      return json(res, 200, { items: rows });
    }

    if (category === "straight_up") {
      const params = [chainId, limit];
      let whereCutoff = "";
      if (cutoff) {
        params.push(cutoff.toISOString());
        whereCutoff = `AND c.graduated_at_chain >= $3::timestamptz`;
      }

      const { rows } = await pool.query(
        `
        SELECT
          c.chain_id,
          c.campaign_address,
          c.name,
          c.symbol,
          c.logo_uri,
          c.creator_address,
          c.created_at_chain,
          c.graduated_at_chain,
          c.created_block,
          c.graduated_block
        FROM campaigns c
        WHERE c.chain_id = $1
          AND c.created_at_chain IS NOT NULL
          AND c.graduated_at_chain IS NOT NULL
          AND (c.graduated_block IS NOT NULL AND c.graduated_block > 0)
          ${whereCutoff}
          AND NOT EXISTS (
            SELECT 1
            FROM curve_trades t
            WHERE t.chain_id = c.chain_id
              AND t.campaign_address = c.campaign_address
              AND t.side = 'sell'
              AND t.block_number >= c.created_block
              AND t.block_number <= c.graduated_block
          )
        ORDER BY c.graduated_at_chain DESC
        LIMIT $2
        `,
        params
      );

      return json(res, 200, { items: rows });
    }

    // largest_buy
    {
      const params = [chainId, limit];
      let whereCutoff = "";
      if (cutoff) {
        params.push(cutoff.toISOString());
        whereCutoff = `AND t.block_time >= $3::timestamptz`;
      }

      const { rows } = await pool.query(
        `
        SELECT
          t.chain_id,
          t.campaign_address,
          c.name,
          c.symbol,
          c.logo_uri,
          c.creator_address,
          c.fee_recipient_address,
          t.wallet AS buyer_address,
          t.bnb_amount_raw,
          t.tx_hash,
          t.log_index,
          t.block_number,
          t.block_time
        FROM curve_trades t
        JOIN campaigns c
          ON c.chain_id = t.chain_id
         AND c.campaign_address = t.campaign_address
        WHERE t.chain_id = $1
          AND t.side = 'buy'
          ${whereCutoff}
          -- anti-abuse exclusions
          AND t.wallet <> c.campaign_address
          AND (c.creator_address IS NULL OR t.wallet <> c.creator_address)
          AND (c.fee_recipient_address IS NULL OR t.wallet <> c.fee_recipient_address)
          -- ensure "during bonding" when we have a graduation block
          AND (
            c.graduated_block IS NULL OR c.graduated_block = 0 OR t.block_number <= c.graduated_block
          )
        ORDER BY t.bnb_amount_raw::numeric DESC NULLS LAST
        LIMIT $2
        `,
        params
      );

      return json(res, 200, { items: rows });
    }
  } catch (e) {
    // If the DB schema hasn't been migrated yet, avoid breaking the UI with 500s.
    // Return empty results and log the error for debugging.
    const code = e?.code;
    console.error("[api/league]", e);
    if (code === "42P01" || code === "42703") {
      return json(res, 200, { items: [], warning: "DB schema missing league columns/tables" });
    }
    return json(res, 500, { error: "Server error" });
  }
}
