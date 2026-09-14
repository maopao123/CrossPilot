-- CreateTable
CREATE TABLE "automation_operations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "action_id" TEXT,
    "connection_id" TEXT NOT NULL,
    "operation_kind" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "approved_payload_hash" TEXT,
    "mode" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "recovery" TEXT NOT NULL,
    "external_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lease_owner" TEXT,
    "lease_until" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_operations_workspace_id_idx" ON "automation_operations"("workspace_id");

-- CreateIndex
CREATE INDEX "automation_operations_action_id_idx" ON "automation_operations"("action_id");

-- CreateIndex
CREATE INDEX "automation_operations_phase_next_attempt_at_idx" ON "automation_operations"("phase", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "automation_operations_workspace_id_connection_id_operation__key" ON "automation_operations"("workspace_id", "connection_id", "operation_kind", "idempotency_key");

-- AddForeignKey
ALTER TABLE "automation_operations" ADD CONSTRAINT "automation_operations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_operations" ADD CONSTRAINT "automation_operations_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "planned_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
