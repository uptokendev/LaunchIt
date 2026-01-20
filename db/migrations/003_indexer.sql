-- db/migrations/003_indexer.sql
--
-- Supabase-only DB standardization:
-- Adds the indexer/trading tables used by realtime-indexer (Railway) and
-- aligns the existing campaigns table with the indexer’s expectations.

BEGIN;

-- =========================================================
-- 1) campaigns: extend the existing social registry with indexer fields
-- =========================================================

ALTER TABLE IF EXISTS public.campaigns
  ADD COLUMN IF NOT EXISTS created_block BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_campaigns_active
  ON public.campaigns (chain_id, is_active);

-- =========================================================
-- 2) indexer_state: simple cursor -> last indexed block
--    Used by realtime-indexer/src/indexer.ts
-- =========================================================

CREATE TABLE IF NOT EXISTS public.indexer_state (
  chain_id           INTEGER NOT NULL,
  cursor             TEXT NOT NULL,
  last_indexed_block BIGINT NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (chain_id, cursor)
);

-- =========================================================
-- 3) curve_trades: normalized buy/sell events (bonding curve)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.curve_trades (
  chain_id          INTEGER NOT NULL,
  campaign_address  TEXT NOT NULL,          -- lowercase

  tx_hash           TEXT NOT NULL,          -- lowercase
  log_index         INTEGER NOT NULL,
  block_number      BIGINT NOT NULL,
  block_time        TIMESTAMPTZ NOT NULL,

  side              TEXT NOT NULL,          -- 'buy' | 'sell'
  wallet            TEXT NOT NULL,          -- lowercase

  token_amount_raw  NUMERIC(78, 0) NOT NULL,
  bnb_amount_raw    NUMERIC(78, 0) NOT NULL,

  -- Convenience floats for UI (source of truth remains *_raw)
  token_amount      DOUBLE PRECISION,
  bnb_amount        DOUBLE PRECISION,
  price_bnb         DOUBLE PRECISION,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT curve_trades_uniq_log PRIMARY KEY (chain_id, tx_hash, log_index),
  CONSTRAINT curve_trades_campaign_lowercase CHECK (campaign_address = lower(campaign_address)),
  CONSTRAINT curve_trades_txhash_lowercase   CHECK (tx_hash = lower(tx_hash)),
  CONSTRAINT curve_trades_wallet_lowercase   CHECK (wallet = lower(wallet)),
  CONSTRAINT curve_trades_side_chk           CHECK (side IN ('buy', 'sell'))
);

CREATE INDEX IF NOT EXISTS idx_curve_trades_campaign_time
  ON public.curve_trades (chain_id, campaign_address, block_number DESC, log_index DESC);

CREATE INDEX IF NOT EXISTS idx_curve_trades_wallet_time
  ON public.curve_trades (chain_id, wallet, block_number DESC, log_index DESC);

CREATE INDEX IF NOT EXISTS idx_curve_trades_block_time
  ON public.curve_trades (chain_id, block_time DESC);

-- =========================================================
-- 4) token_candles: OHLCV buckets for charts
-- =========================================================

CREATE TABLE IF NOT EXISTS public.token_candles (
  chain_id          INTEGER NOT NULL,
  campaign_address  TEXT NOT NULL,          -- lowercase
  timeframe         TEXT NOT NULL,          -- e.g. '5s', '1m', '5m'
  bucket_start      TIMESTAMPTZ NOT NULL,

  o                DOUBLE PRECISION NOT NULL,
  h                DOUBLE PRECISION NOT NULL,
  l                DOUBLE PRECISION NOT NULL,
  c                DOUBLE PRECISION NOT NULL,

  volume_bnb       DOUBLE PRECISION NOT NULL DEFAULT 0,
  trades_count     INTEGER NOT NULL DEFAULT 0,

  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (chain_id, campaign_address, timeframe, bucket_start),
  CONSTRAINT token_candles_campaign_lowercase CHECK (campaign_address = lower(campaign_address))
);

CREATE INDEX IF NOT EXISTS idx_token_candles_campaign_tf_time
  ON public.token_candles (chain_id, campaign_address, timeframe, bucket_start DESC);

-- =========================================================
-- 5) token_stats: cached summary used by /api/token/:campaign/summary
-- =========================================================

CREATE TABLE IF NOT EXISTS public.token_stats (
  chain_id          INTEGER NOT NULL,
  campaign_address  TEXT NOT NULL,          -- lowercase

  last_price_bnb    DOUBLE PRECISION,
  sold_tokens       DOUBLE PRECISION NOT NULL DEFAULT 0,
  marketcap_bnb     DOUBLE PRECISION,
  vol_24h_bnb       DOUBLE PRECISION NOT NULL DEFAULT 0,

  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (chain_id, campaign_address),
  CONSTRAINT token_stats_campaign_lowercase CHECK (campaign_address = lower(campaign_address))
);

CREATE INDEX IF NOT EXISTS idx_token_stats_updated
  ON public.token_stats (chain_id, updated_at DESC);

COMMIT;
