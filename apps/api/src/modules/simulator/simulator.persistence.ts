import { Injectable } from '@nestjs/common';
import { SimulatorStore } from '@crosspilot/db';
import { PrismaService } from '../prisma/prisma.service.js';

export {
  SIM_AMAZON_PROVIDER,
  SIM_SHOPIFY_PROVIDER,
  SIM_CAMPAIGN_NAME,
  SIM_REVIEWER_PREFIX,
  SimulatorConflictError,
  SimulatorCatalogMissingError,
} from '@crosspilot/db';
export type {
  SimFixtures,
  StoredSimState,
  SimulationStateRow,
  SimulatorTickResult,
} from '@crosspilot/db';

/**
 * NestJS provider wrapper around the shared SimulatorStore (@crosspilot/db),
 * so the same persistence + orchestration serves both the API and the worker.
 */
@Injectable()
export class SimulatorPersistenceService extends SimulatorStore {
  constructor(prisma: PrismaService) {
    super(prisma);
  }
}
