import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Create a Drizzle client bound to a fresh pg Pool.
 * The relational schema (incl. relations) is passed in so `db.query.*` works.
 */
export function createDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export type DB = ReturnType<typeof createDb>;
