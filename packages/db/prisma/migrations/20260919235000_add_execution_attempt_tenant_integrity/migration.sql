-- CreateIndex
CREATE UNIQUE INDEX "automation_operations_id_workspace_id_key" ON "automation_operations"("id", "workspace_id");

-- DropForeignKey
ALTER TABLE "execution_attempts" DROP CONSTRAINT "execution_attempts_operation_id_fkey";

-- AddForeignKey
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_operation_id_workspace_id_fkey" FOREIGN KEY ("operation_id", "workspace_id") REFERENCES "automation_operations"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
