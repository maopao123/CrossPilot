-- V10 — Simulator closed-loop-v2 (additive)

-- 1. Extend action_outcomes with v2 evaluation fields
ALTER TABLE "action_outcomes"
  ADD COLUMN IF NOT EXISTS "evaluation_version" TEXT NOT NULL DEFAULT 'legacy-v1',
  ADD COLUMN IF NOT EXISTS "intervention_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "data_coverage" JSONB;

-- 2. Simulation Experiments
CREATE TABLE IF NOT EXISTS "simulation_experiments" (
    "id" TEXT NOT NULL,
    "control_workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scenario_manifest" JSONB NOT NULL,
    "seed_manifest" JSONB NOT NULL,
    "manifest_hash" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL DEFAULT 'v1.0.0',
    "evaluation_version" TEXT NOT NULL DEFAULT 'closed-loop-v2',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "control_run_id" TEXT,
    "rule_run_id" TEXT,
    "cross_pilot_run_id" TEXT,
    "results" JSONB,
    "artifacts" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "simulation_experiments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "simulation_experiments_control_workspace_id_idx" ON "simulation_experiments"("control_workspace_id");

-- 3. Simulation Runs
CREATE TABLE IF NOT EXISTS "simulation_runs" (
    "id" TEXT NOT NULL,
    "control_workspace_id" TEXT NOT NULL,
    "run_workspace_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "model_version" TEXT NOT NULL DEFAULT 'closed-loop-v2',
    "config_hash" TEXT NOT NULL,
    "seed" INTEGER NOT NULL DEFAULT 1001,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "completed_through" DATE,
    "parent_experiment_id" TEXT,
    "state_snapshot" JSONB,
    "config" JSONB,
    "policy_enabled" BOOLEAN NOT NULL DEFAULT false,
    "policy_limits" JSONB,
    "idempotency_key" TEXT,
    "state_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "simulation_runs" ADD COLUMN IF NOT EXISTS "state_version" INTEGER NOT NULL DEFAULT 1;


CREATE UNIQUE INDEX IF NOT EXISTS "simulation_runs_run_workspace_id_key" ON "simulation_runs"("run_workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "simulation_runs_idempotency_key_key" ON "simulation_runs"("idempotency_key");
CREATE INDEX IF NOT EXISTS "simulation_runs_control_workspace_id_idx" ON "simulation_runs"("control_workspace_id");
CREATE INDEX IF NOT EXISTS "simulation_runs_status_idx" ON "simulation_runs"("status");

-- 4. Simulation Ticks
CREATE TABLE IF NOT EXISTS "simulation_ticks" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "input_hash" TEXT NOT NULL,
    "output_hash" TEXT NOT NULL,
    "state_version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'COMMITTED',
    "summary" JSONB,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "simulation_ticks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "simulation_ticks_run_id_date_key" ON "simulation_ticks"("run_id", "date");
CREATE INDEX IF NOT EXISTS "simulation_ticks_run_id_idx" ON "simulation_ticks"("run_id");

-- 5. Simulation Execution Receipts
CREATE TABLE IF NOT EXISTS "simulation_execution_receipts" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "operation_kind" TEXT NOT NULL DEFAULT 'APPLY',
    "payload_hash" TEXT NOT NULL,
    "applied_date" DATE NOT NULL,
    "target_version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "before_state" JSONB,
    "after_state" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "simulation_execution_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "simulation_execution_receipts_run_id_action_id_operation_kind_key" ON "simulation_execution_receipts"("run_id", "action_id", "operation_kind");
CREATE INDEX IF NOT EXISTS "simulation_execution_receipts_run_id_idx" ON "simulation_execution_receipts"("run_id");
CREATE INDEX IF NOT EXISTS "simulation_execution_receipts_action_id_idx" ON "simulation_execution_receipts"("action_id");

-- 6. Simulation Ledger Entries
CREATE TABLE IF NOT EXISTS "simulation_ledger_entries" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "signed_amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "simulation_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "simulation_ledger_entries_run_id_date_source_type_source_id_entry_type_sequence_key" ON "simulation_ledger_entries"("run_id", "date", "source_type", "source_id", "entry_type", "sequence");
CREATE INDEX IF NOT EXISTS "simulation_ledger_entries_run_id_date_idx" ON "simulation_ledger_entries"("run_id", "date");

-- Foreign Keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_experiments_control_workspace_id_fkey') THEN
    ALTER TABLE "simulation_experiments"
      ADD CONSTRAINT "simulation_experiments_control_workspace_id_fkey"
      FOREIGN KEY ("control_workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_runs_control_workspace_id_fkey') THEN
    ALTER TABLE "simulation_runs"
      ADD CONSTRAINT "simulation_runs_control_workspace_id_fkey"
      FOREIGN KEY ("control_workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_runs_run_workspace_id_fkey') THEN
    ALTER TABLE "simulation_runs"
      ADD CONSTRAINT "simulation_runs_run_workspace_id_fkey"
      FOREIGN KEY ("run_workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_runs_store_id_fkey') THEN
    ALTER TABLE "simulation_runs"
      ADD CONSTRAINT "simulation_runs_store_id_fkey"
      FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_runs_parent_experiment_id_fkey') THEN
    ALTER TABLE "simulation_runs"
      ADD CONSTRAINT "simulation_runs_parent_experiment_id_fkey"
      FOREIGN KEY ("parent_experiment_id") REFERENCES "simulation_experiments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_ticks_run_id_fkey') THEN
    ALTER TABLE "simulation_ticks"
      ADD CONSTRAINT "simulation_ticks_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_execution_receipts_run_id_fkey') THEN
    ALTER TABLE "simulation_execution_receipts"
      ADD CONSTRAINT "simulation_execution_receipts_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_execution_receipts_action_id_fkey') THEN
    ALTER TABLE "simulation_execution_receipts"
      ADD CONSTRAINT "simulation_execution_receipts_action_id_fkey"
      FOREIGN KEY ("action_id") REFERENCES "planned_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_ledger_entries_run_id_fkey') THEN
    ALTER TABLE "simulation_ledger_entries"
      ADD CONSTRAINT "simulation_ledger_entries_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulation_ledger_entries_store_id_fkey') THEN
    ALTER TABLE "simulation_ledger_entries"
      ADD CONSTRAINT "simulation_ledger_entries_store_id_fkey"
      FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
