-- db/migrations/004_social_fixes.sql
-- Small compatibility fixes for the Vercel API functions.

BEGIN;

-- The Vercel API endpoints (auth nonce + profile upsert) mark nonces as used.
ALTER TABLE IF EXISTS public.auth_nonces
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

COMMIT;
