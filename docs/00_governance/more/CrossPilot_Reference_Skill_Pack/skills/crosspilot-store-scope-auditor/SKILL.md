---
name: crosspilot-store-scope-auditor
description: Audit tenant, workspace, channel, store, SKU, and simulator data scoping in CrossPilot. Use for multi-store support, destructive cleanup, mock data, imports, metrics, orders, campaigns, inventory, and profit tables.
---
# Store Scope Auditor

## Scope key
Prefer an explicit chain such as:
`tenant/workspace -> channel -> store -> product/SKU/campaign`.

## Check
- Order, ProfitDaily, Campaign, InventoryBalance, ChannelDailyMetric.
- SKU unique constraints.
- Delete/updateMany operations.
- Simulator reset/seed paths.
- Import deduplication keys.
- Cross-store joins.

## Destructive-operation rule
Every destructive call must prove its scope. A workspaceId alone is insufficient when real and simulator data or multiple stores can coexist.

## Output
Show collision examples and exact migration/test plan.
