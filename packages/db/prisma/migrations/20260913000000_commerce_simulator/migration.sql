-- CreateTable
CREATE TABLE "simulation_states" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sim_date" DATE NOT NULL,
    "day_index" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulation_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sku_id" TEXT,
    "sim_date" DATE NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_daily_metrics" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "metric_date" DATE NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "add_to_cart" INTEGER NOT NULL DEFAULT 0,
    "checkout" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "conversion_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "bounce_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "simulation_states_workspace_id_key" ON "simulation_states"("workspace_id");

-- CreateIndex
CREATE INDEX "simulation_events_workspace_id_idx" ON "simulation_events"("workspace_id");

-- CreateIndex
CREATE INDEX "simulation_events_sim_date_idx" ON "simulation_events"("sim_date");

-- CreateIndex
CREATE INDEX "channel_daily_metrics_workspace_id_idx" ON "channel_daily_metrics"("workspace_id");

-- CreateIndex
CREATE INDEX "channel_daily_metrics_metric_date_idx" ON "channel_daily_metrics"("metric_date");

-- CreateIndex
CREATE UNIQUE INDEX "channel_daily_metrics_workspace_id_channel_sku_id_metric_da_key" ON "channel_daily_metrics"("workspace_id", "channel", "sku_id", "metric_date");

-- AddForeignKey
ALTER TABLE "simulation_states" ADD CONSTRAINT "simulation_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_events" ADD CONSTRAINT "simulation_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_events" ADD CONSTRAINT "simulation_events_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_daily_metrics" ADD CONSTRAINT "channel_daily_metrics_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_daily_metrics" ADD CONSTRAINT "channel_daily_metrics_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

