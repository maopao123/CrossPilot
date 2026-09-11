import { ToolRegistry } from '../registry/tool.registry.js';
import { FinanceProfitCalculateTool } from './finance-profit-calculate.tool.js';
import { ComplianceListingCheckTool } from './compliance-listing-check.tool.js';
import { AdvertisingSearchTermAnalyzeTool } from './advertising-searchterm-analyze.tool.js';
import { OperationBidAdjustTool } from './operation-bid-adjust.tool.js';
import { InventoryReplenishmentCalculateTool } from './inventory-replenishment-calculate.tool.js';
import { BiVarianceAttributeTool } from './bi-variance-attribute.tool.js';
import {
  CreativeImageGenerateTool,
  CreativeImageLifestyleTool,
  CreativeBackgroundReplaceTool,
  CreativeInfographicGenerateTool,
  CreativeImageResizeTool,
  CreativeVideoGenerateTool,
} from './creative-studio.tools.js';
import {
  OperationKeywordCombineTool,
  OperationListingPublishTool,
} from './operation-automation.tools.js';

export const ALL_DEFAULT_TOOLS = [
  // Existing Domain Wrappers
  FinanceProfitCalculateTool,
  ComplianceListingCheckTool,
  AdvertisingSearchTermAnalyzeTool,
  OperationBidAdjustTool,
  InventoryReplenishmentCalculateTool,
  BiVarianceAttributeTool,

  // Creative Studio Tools (P0)
  CreativeImageGenerateTool,
  CreativeImageLifestyleTool,
  CreativeBackgroundReplaceTool,
  CreativeInfographicGenerateTool,
  CreativeImageResizeTool,
  CreativeVideoGenerateTool,

  // Operation Automation Tools (P0)
  OperationKeywordCombineTool,
  OperationListingPublishTool,
];

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of ALL_DEFAULT_TOOLS) {
    registry.register(tool);
  }
  return registry;
}
