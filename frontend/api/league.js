import { pool } from "./_db.js";
import { badMethod, getQuery, json } from "./_http.js";

const CATEGORIES = new Set(["straight_up", "fastest_graduation", "largest_buy"]);
const PERIODS = new Set(["weekly", "monthly", "all_time"]);

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId ?? 97);
    const category = String(q.category ?? "straight_up").toLowerCase();
    const period = String(q.period ?? "weekly").toLowerCase();
    const limit = Math.max(1, Math.min(100, Number(q.limit ?? 50)));

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!CATEGORIES.has(category)) return json(res, 400, { error: "Invalid category" });
    if (!PERIODS.has(period)) return json(res, 400, { error: "Invalid period" });

    const periodFilterCampaign =
      period === "monthly"
        ? "c.graduated_at_chain >= date_trunc('month', now()) and c.graduated_at_chain < date_trunc('month', now()) + interval '1 month'"
        : period === "weekly"
        ? "c.graduated_at_chain >= date_trunc('week', now()) and c.graduated_at_chain < date_trunc('week', now()) + interval '1 week'"
        : "true";

    const periodFilterTrades =
      period === "monthly"
        ? "t.block_time >= date_trunc('month', now()) and t.block_time < date_trunc('month', now()) + interval '1 month'"
        : period === "weekly"
        ? "t.block_time >= date_trunc('week', now()) and t.block_time < date_trunc('week', now()) + interval '1 week'"
        : "true";

    if (category === "largest_buy") {
      const { rows } = await pool.query(
        `select
           t.campaign_address,
           c.name,
           c.symbol,
           c.logo_uri,
           c.creator_address,
           c.fee_recipient_address,
           t.wallet as buyer_address,
           t.bnb_amount_raw as bnb_amount_raw,
           t.tx_hash,
           t.log_index,
           t.block_number,
           t.block_time
         from public.curve_trades t
         join public.campaigns c
           on c.chain_id=t.chain_id and c.campaign_address=t.campaign_address
         where t.chain_id=$1
           and t.side='buy'
           and ${periodFilterTrades}
           and lower(t.wallet) <> lower(c.creator_address)
           and (c.fee_recipient_address is null or lower(t.wallet) <> lower(c.fee_recipient_address))
           and lower(t.wallet) <> lower(c.campaign_address)
         order by (t.bnb_amount_raw::numeric) desc, t.block_number desc, t.log_index desc
         limit $2`,
        [chainId, limit]
      );

      return json(res, 200, { chainId, category, period, items: rows });
    }

    const requireUniqueBuyers = category === "fastest_graduation";
    const extra = [];
    if (requireUniqueBuyers) extra.push("coalesce(s.unique_buyers,0) >= 25");
    if (category === "straight_up") extra.push("coalesce(s.sells_count,0) = 0");
    const extraWhere = extra.length ? `and ${extra.join(" and ")}` : "";

    const { rows } = await pool.query(
      `with stats as (
         select
           t.chain_id,
           t.campaign_address,
           count(distinct case when t.side='buy' then t.wallet end) as unique_buyers,
           sum(case when t.side='sell' then 1 else 0 end) as sells_count
         from public.curve_trades t
         where t.chain_id=$1
         group by t.chain_id, t.campaign_address
       )
       select
         c.campaign_address,
         c.name,
         c.symbol,
         c.logo_uri,
         c.created_at_chain,
         c.graduated_at_chain,
         extract(epoch from (c.graduated_at_chain - c.created_at_chain))::bigint as duration_seconds,
         coalesce(s.unique_buyers,0)::bigint as unique_buyers,
         coalesce(s.sells_count,0)::bigint as sells_count
       from public.campaigns c
       left join stats s
         on s.chain_id=c.chain_id and s.campaign_address=c.campaign_address
       where c.chain_id=$1
         and c.created_at_chain is not null
         and c.graduated_at_chain is not null
         and ${periodFilterCampaign}
         ${extraWhere}
       order by duration_seconds asc nulls last, c.graduated_at_chain desc
       limit $2`,
      [chainId, limit]
    );

    return json(res, 200, { chainId, category, period, items: rows });
  } catch (e) {
    console.error("[api/league]", e);
    return json(res, 500, { error: "Server error" });
  }
}
