ALTER TABLE "scores" ADD COLUMN "judge_model_id" uuid;--> statement-breakpoint
-- Backfill existing scores from their run's judge (score -> response -> execution -> eval_run).
UPDATE "scores" s
SET "judge_model_id" = er."judge_model_id"
FROM "responses" r
JOIN "executions" e ON e."id" = r."execution_id"
JOIN "eval_runs" er ON er."id" = e."eval_run_id"
WHERE r."id" = s."response_id" AND s."judge_model_id" IS NULL;--> statement-breakpoint
ALTER TABLE "scores" ALTER COLUMN "judge_model_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_judge_model_id_models_id_fk" FOREIGN KEY ("judge_model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;
