-- Judge failure tracing.
--
-- Hand-corrected: drizzle-kit generated this as a full CREATE TABLE for judge_calls
-- plus an ADD COLUMN for models.is_active_judge, because both were applied to the
-- database outside the migration system and never entered a snapshot. Both already
-- exist, so the generated form would have failed on the first statement. What follows
-- is the real delta against the live schema.

CREATE TYPE "public"."judge_failure_reason" AS ENUM('timeout', 'provider_error', 'malformed_json', 'refusal', 'no_scores');--> statement-breakpoint

-- A call that failed before the model answered has no output to record.
ALTER TABLE "judge_calls" ALTER COLUMN "raw_output" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "judge_calls" ADD COLUMN IF NOT EXISTS "failure_reason" "judge_failure_reason";--> statement-breakpoint
ALTER TABLE "judge_calls" ADD COLUMN IF NOT EXISTS "failure_detail" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "judge_calls_failure_reason_idx" ON "judge_calls" USING btree ("failure_reason");--> statement-breakpoint

-- Align the two foreign keys with the names drizzle's snapshot expects. They were
-- created outside the tool and carry Postgres' default *_fkey names, which would make
-- every future `db:generate` propose dropping and recreating them.
ALTER TABLE "judge_calls" RENAME CONSTRAINT "judge_calls_response_id_fkey" TO "judge_calls_response_id_responses_id_fk";--> statement-breakpoint
ALTER TABLE "judge_calls" RENAME CONSTRAINT "judge_calls_judge_model_id_fkey" TO "judge_calls_judge_model_id_models_id_fk";
