-- CreateTable
CREATE TABLE "execution_audits" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "action_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "audit_action" TEXT NOT NULL,
    "reason" TEXT,
    "before_state" JSONB NOT NULL,
    "after_state" JSONB NOT NULL,
    "metadata" JSONB,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "execution_audits_workspace_id_operation_id_created_at_idx" ON "execution_audits"("workspace_id", "operation_id", "created_at");

-- CreateIndex
CREATE INDEX "execution_audits_workspace_id_actor_id_created_at_idx" ON "execution_audits"("workspace_id", "actor_id", "created_at");

-- CreateIndex
CREATE INDEX "execution_audits_operation_id_created_at_idx" ON "execution_audits"("operation_id", "created_at");

-- AddForeignKey
ALTER TABLE "execution_audits" ADD CONSTRAINT "execution_audits_operation_id_workspace_id_fkey" FOREIGN KEY ("operation_id", "workspace_id") REFERENCES "automation_operations"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
