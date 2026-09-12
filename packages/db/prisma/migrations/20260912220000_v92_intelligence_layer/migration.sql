-- V9.2 Phase 2–5 Fact / Evidence / Recommendation (additive)

CREATE TABLE IF NOT EXISTS "commerce_facts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "fact_type" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "source_provider" TEXT NOT NULL,
    "source_reference" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "playbook_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commerce_facts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commerce_facts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "commerce_facts_workspace_id_idx" ON "commerce_facts"("workspace_id");
CREATE INDEX IF NOT EXISTS "commerce_facts_playbook_run_id_idx" ON "commerce_facts"("playbook_run_id");

CREATE TABLE IF NOT EXISTS "evidence_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "fact_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "playbook_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evidence_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "evidence_items_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "commerce_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "evidence_items_workspace_id_idx" ON "evidence_items"("workspace_id");
CREATE INDEX IF NOT EXISTS "evidence_items_fact_id_idx" ON "evidence_items"("fact_id");

CREATE TABLE IF NOT EXISTS "business_recommendations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "evidence_ids" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "playbook_run_id" TEXT,
    "execution_dispatched" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_recommendations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_recommendations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "business_recommendations_workspace_id_idx" ON "business_recommendations"("workspace_id");
CREATE INDEX IF NOT EXISTS "business_recommendations_status_idx" ON "business_recommendations"("status");
