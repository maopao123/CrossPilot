-- V10 Epic 1: Store + ChannelIdentity + CommerceAccount.store_id
-- Additive → backfill → drop (workspace_id, provider) unique → unique(store_id)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "stores" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stores_workspace_id_idx" ON "stores"("workspace_id");
CREATE INDEX IF NOT EXISTS "stores_workspace_id_platform_idx" ON "stores"("workspace_id", "platform");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_workspace_id_fkey'
  ) THEN
    ALTER TABLE "stores"
      ADD CONSTRAINT "stores_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "channel_identities" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "channel_identities_store_platform_type_external_key"
  ON "channel_identities"("store_id", "platform", "entity_type", "external_id");
CREATE INDEX IF NOT EXISTS "channel_identities_store_id_idx" ON "channel_identities"("store_id");
CREATE INDEX IF NOT EXISTS "channel_identities_entity_type_entity_id_idx"
  ON "channel_identities"("entity_type", "entity_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_identities_store_id_fkey'
  ) THEN
    ALTER TABLE "channel_identities"
      ADD CONSTRAINT "channel_identities_store_id_fkey"
      FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "commerce_accounts" ADD COLUMN IF NOT EXISTS "store_id" TEXT;

DO $$
DECLARE
  rec RECORD;
  sid TEXT;
  plat TEXT;
  sname TEXT;
  ctry TEXT;
BEGIN
  FOR rec IN SELECT * FROM commerce_accounts WHERE store_id IS NULL LOOP
    plat := CASE
      WHEN rec.provider LIKE 'simulator%' THEN 'simulator'
      WHEN rec.provider = 'shopify' THEN 'shopify'
      ELSE 'amazon'
    END;
    sname := CASE rec.provider
      WHEN 'simulator-amazon' THEN 'Simulator Amazon'
      WHEN 'simulator-shopify' THEN 'Simulator Shopify'
      WHEN 'shopify' THEN 'Shopify Store'
      ELSE CASE rec.region
        WHEN 'EU' THEN 'Amazon EU'
        WHEN 'FE' THEN 'Amazon FE'
        ELSE 'Amazon US'
      END
    END;
    ctry := CASE
      WHEN rec.provider = 'simulator-shopify' THEN COALESCE(rec.default_marketplace_code, 'US')
      WHEN rec.region = 'EU' THEN 'DE'
      WHEN rec.region = 'FE' THEN 'JP'
      ELSE 'US'
    END;
    IF ctry LIKE 'AMAZON_%' THEN
      ctry := 'US';
    END IF;
    sid := gen_random_uuid()::text;
    INSERT INTO stores (id, workspace_id, name, platform, country, status, created_at, updated_at)
    VALUES (sid, rec.workspace_id, sname, plat, ctry, 'ACTIVE', NOW(), NOW());
    UPDATE commerce_accounts SET store_id = sid WHERE id = rec.id;
  END LOOP;
END $$;

-- leftover empty string / still-null should not happen; fail closed if any remain
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM commerce_accounts WHERE store_id IS NULL) THEN
    RAISE EXCEPTION 'V10 Epic 1 backfill left commerce_accounts.store_id NULL';
  END IF;
END $$;

ALTER TABLE "commerce_accounts" ALTER COLUMN "store_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commerce_accounts_store_id_fkey'
  ) THEN
    ALTER TABLE "commerce_accounts"
      ADD CONSTRAINT "commerce_accounts_store_id_fkey"
      FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "commerce_accounts_workspace_id_provider_key";

CREATE UNIQUE INDEX IF NOT EXISTS "commerce_accounts_store_id_key" ON "commerce_accounts"("store_id");
CREATE INDEX IF NOT EXISTS "commerce_accounts_workspace_id_provider_idx"
  ON "commerce_accounts"("workspace_id", "provider");
