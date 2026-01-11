import { Pool } from "pg";
import { ENV } from "./env.js";

const isLocal = process.env.NODE_ENV !== "production";

export const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
  // Supabase pooler requires SSL; in many hosted envs the chain can appear "self-signed"
  ssl: {
    rejectUnauthorized: false
  },
  max: 10
});