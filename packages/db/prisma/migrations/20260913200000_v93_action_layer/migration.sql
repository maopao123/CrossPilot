-- V9.3 Action Layer (additive)

CREATE TABLE IF NOT EXISTS "planned_actions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "recommendation_id" TEXT,
    "action_type" TEXT NOT NULL,
    "target" JSONB NOT NULL,
    "parameters" JSONB NOT NULL,
    "risk_level" TEXT NOT NULL,
    "need_approval" BOOLEAN NOT NULL DEFAULT TRUE,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "last_message" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "planned_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "action_executions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "action_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "planned_actions_workspace_id_idx" ON "planned_actions"("workspace_id");
CREATE INDEX IF NOT EXISTS "planned_actions_recommendation_id_idx" ON "planned_actions"("recommendation_id");
CREATE INDEX IF NOT EXISTS "planned_actions_status_idx" ON "planned_actions"("status");
CREATE INDEX IF NOT EXISTS "action_executions_workspace_id_idx" ON "action_executions"("workspace_id");
CREATE INDEX IF NOT EXISTS "action_executions_action_id_idx" ON "action_executions"("action_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planned_actions_workspace_id_fkey'
  ) THEN
    ALTER TABLE "planned_actions"
      ADD CONSTRAINT "planned_actions_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planned_actions_recommendation_id_fkey'
  ) THEN
    ALTER TABLE "planned_actions"
      ADD CONSTRAINT "planned_actions_recommendation_id_fkey"
      FOREIGN KEY ("recommendation_id") REFERENCES "business_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'action_executions_workspace_id_fkey'
  ) THEN
    ALTER TABLE "action_executions"
      ADD CONSTRAINT "action_executions_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'action_executions_action_id_fkey'
  ) THEN
    ALTER TABLE "action_executions"
      ADD CONSTRAINT "action_executions_action_id_fkey"
      FOREIGN KEY ("action_id") REFERENCES "planned_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
