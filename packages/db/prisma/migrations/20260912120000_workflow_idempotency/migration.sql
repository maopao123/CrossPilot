-- V91-017: persistent WF-05 idempotency mapping (additive, no table rebuild)

CREATE TABLE "workflow_idempotency" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_idempotency_workspace_id_scope_idempotency_key_key"
ON "workflow_idempotency"("workspace_id", "scope", "idempotency_key");

CREATE INDEX "workflow_idempotency_task_id_idx" ON "workflow_idempotency"("task_id");

CREATE INDEX "workflow_idempotency_workspace_id_idx" ON "workflow_idempotency"("workspace_id");

ALTER TABLE "workflow_idempotency"
ADD CONSTRAINT "workflow_idempotency_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
