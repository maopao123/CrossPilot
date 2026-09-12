-- V9.2 Phase 1 Playbook Framework (additive; does not alter existing tables)

CREATE TABLE IF NOT EXISTS "playbooks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "input_schema" JSONB NOT NULL,
    "output_schema" JSONB NOT NULL,
    "definition" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playbooks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "playbooks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "playbooks_workspace_id_name_version_key" ON "playbooks"("workspace_id", "name", "version");
CREATE INDEX IF NOT EXISTS "playbooks_workspace_id_idx" ON "playbooks"("workspace_id");

CREATE TABLE IF NOT EXISTS "playbook_runs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "playbook_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playbook_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "playbook_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "playbook_runs_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "playbook_runs_run_id_key" ON "playbook_runs"("run_id");
CREATE INDEX IF NOT EXISTS "playbook_runs_workspace_id_idx" ON "playbook_runs"("workspace_id");
CREATE INDEX IF NOT EXISTS "playbook_runs_playbook_id_idx" ON "playbook_runs"("playbook_id");
