-- CreateTable
CREATE TABLE "execution_attempts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "attempt_type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "worker_id" TEXT,
    "trace_id" TEXT,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "error_class" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "effect" TEXT,
    "recovery" TEXT,
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "execution_attempts_operation_id_attempt_no_key" ON "execution_attempts"("operation_id", "attempt_no");

-- CreateIndex
CREATE INDEX "execution_attempts_workspace_id_operation_id_idx" ON "execution_attempts"("workspace_id", "operation_id");

-- CreateIndex
CREATE INDEX "execution_attempts_operation_id_started_at_idx" ON "execution_attempts"("operation_id", "started_at");

-- CreateIndex
CREATE INDEX "execution_attempts_workspace_id_started_at_idx" ON "execution_attempts"("workspace_id", "started_at");

-- AddForeignKey
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "automation_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
