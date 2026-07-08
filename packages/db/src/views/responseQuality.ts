import { sql } from "drizzle-orm";
import { integer, numeric, pgView, uuid } from "drizzle-orm/pg-core";

// Overall response quality = Σ(score × weight) / Σ(weight).
// A database VIEW, never a stored column — so it can't go stale.
export const responseQuality = pgView("response_quality", {
  responseId: uuid("response_id"),
  weightedScore: numeric("weighted_score"),
  criteriaScored: integer("criteria_scored"),
}).as(sql`
  SELECT
    s.response_id AS response_id,
    SUM(s.score * rc.weight) / NULLIF(SUM(rc.weight), 0) AS weighted_score,
    COUNT(*)::int AS criteria_scored
  FROM scores s
  JOIN rubric_criteria rc ON rc.id = s.rubric_criterion_id
  GROUP BY s.response_id
`);
