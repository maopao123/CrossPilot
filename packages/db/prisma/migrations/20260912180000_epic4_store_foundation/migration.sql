-- Epic 4 additive store foundation (does not rewrite existing rows)

ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "amazon_seller_sku" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "external_order_id" TEXT;
ALTER TABLE "inventory_balances" ADD COLUMN IF NOT EXISTS "source_updated_at" TIMESTAMP(3);
ALTER TABLE "profit_daily" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'ESTIMATED';

CREATE INDEX IF NOT EXISTS "orders_workspace_id_external_order_id_idx" ON "orders"("workspace_id", "external_order_id");
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source_provider" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source_account_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "orders_ws_account_external_uid" ON "orders"("workspace_id", "source_account_id", "external_order_id") WHERE "source_account_id" IS NOT NULL AND "external_order_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "commerce_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'amazon',
    "selling_partner_id" TEXT,
    "region" TEXT NOT NULL DEFAULT 'NA',
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "default_marketplace_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "commerce_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "commerce_accounts_workspace_id_provider_key" ON "commerce_accounts"("workspace_id", "provider");
CREATE INDEX IF NOT EXISTS "commerce_accounts_workspace_id_idx" ON "commerce_accounts"("workspace_id");

CREATE TABLE IF NOT EXISTS "provider_credentials" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload_enc" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "provider_credentials_account_id_kind_key" ON "provider_credentials"("account_id", "kind");
CREATE INDEX IF NOT EXISTS "provider_credentials_account_id_idx" ON "provider_credentials"("account_id");

CREATE TABLE IF NOT EXISTS "sync_runs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "cursor" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "duration_ms" INTEGER,
    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sync_runs_workspace_id_idx" ON "sync_runs"("workspace_id");
CREATE INDEX IF NOT EXISTS "sync_runs_account_id_idx" ON "sync_runs"("account_id");
CREATE INDEX IF NOT EXISTS "sync_runs_started_at_idx" ON "sync_runs"("started_at");

ALTER TABLE "commerce_accounts" ADD CONSTRAINT "commerce_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "commerce_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "commerce_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
