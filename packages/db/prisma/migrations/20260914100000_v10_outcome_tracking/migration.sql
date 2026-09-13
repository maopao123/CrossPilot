-- V10 Epic A — Outcome Tracking (additive)

CREATE TABLE IF NOT EXISTS "action_outcomes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "store_id" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "baseline_start" DATE NOT NULL,
    "baseline_end" DATE NOT NULL,
    "observe_start" DATE NOT NULL,
    "observe_end" DATE NOT NULL,
    "window_days" INTEGER NOT NULL,
    "metrics_before" JSONB NOT NULL,
    "metrics_after" JSONB,
    "delta" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OBSERVING',
    "evaluation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluated_at" TIMESTAMP(3),
    CONSTRAINT "action_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "action_outcomes_action_id_window_days_key" ON "action_outcomes"("action_id", "window_days");
CREATE INDEX IF NOT EXISTS "action_outcomes_workspace_id_status_idx" ON "action_outcomes"("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "action_outcomes_observe_end_idx" ON "action_outcomes"("observe_end");
CREATE INDEX IF NOT EXISTS "action_outcomes_workspace_id_idx" ON "action_outcomes"("workspace_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'action_outcomes_workspace_id_fkey'
  ) THEN
    ALTER TABLE "action_outcomes"
      ADD CONSTRAINT "action_outcomes_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'action_outcomes_action_id_fkey'
  ) THEN
    ALTER TABLE "action_outcomes"
      ADD CONSTRAINT "action_outcomes_action_id_fkey"
      FOREIGN KEY ("action_id") REFERENCES "planned_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
