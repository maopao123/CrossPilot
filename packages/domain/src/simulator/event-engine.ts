import type {
  ActiveSimEvent,
  EventMultipliers,
  SimConfig,
  SimEventRow,
  SimEventSeverity,
  SimWorldState,
} from './types.js';
import { simDateToUtcDate } from './types.js';
import type { Rng } from './rng.js';
import { randRange } from './rng.js';

/**
 * Randomly-triggered anomaly events, ported from the scenario-generator's
 * CORE_BUSINESS_EVENTS (E02 ACOS spike, E03 viral surge, E06 return spike,
 * E07 hole-size negative review wave). Stockout events are not spawned here;
 * they are emitted organically by the inventory engine.
 */
export interface SimEventTemplate {
  code: string;
  severity: SimEventSeverity;
  title: string;
  description: string;
  skuScoped: boolean;
  minDurationDays: number;
  maxDurationDays: number;
  dailyProbability: number;
  multipliers: EventMultipliers;
}

export const SIM_EVENT_TEMPLATES: SimEventTemplate[] = [
  {
    code: 'ACOS_SPIKE',
    severity: 'WARNING',
    title: 'ACOS Spike on Broad Search Terms',
    description:
      'Sponsored Products campaign shows rising ACOS. Broad search terms drain ad budget with poor conversion. Negative keyword recommendation generated.',
    skuScoped: true,
    minDurationDays: 4,
    maxDurationDays: 7,
    dailyProbability: 0.015,
    multipliers: { sales: 1, adsSpend: 2.2, adConversion: 0.45, negativeReview: 1 },
  },
  {
    code: 'VIRAL_SURGE',
    severity: 'INFO',
    title: 'Viral Sales Surge',
    description:
      'Social bathroom decor trend highlights the marble aesthetic. Daily sales velocity jumps; inventory drawdown accelerates.',
    skuScoped: true,
    minDurationDays: 10,
    maxDurationDays: 14,
    dailyProbability: 0.01,
    multipliers: { sales: 3.0, adsSpend: 1.2, adConversion: 1.3, negativeReview: 1 },
  },
  {
    code: 'RETURN_SPIKE',
    severity: 'WARNING',
    title: 'Return Rate Spike',
    description:
      'Customer returns cite hole diameter too narrow for electric toothbrush handles and base chipping. Return loss climbs; customer satisfaction dips.',
    skuScoped: true,
    minDurationDays: 8,
    maxDurationDays: 14,
    dailyProbability: 0.012,
    multipliers: { sales: 0.95, adsSpend: 1, adConversion: 1, negativeReview: 1.5 },
  },
  {
    code: 'NEGATIVE_REVIEW_WAVE',
    severity: 'WARNING',
    title: 'Negative Review Wave: Hole-Size Defect',
    description:
      'VOC analysis identifies the primary customer complaint: reviews complain "hole too small for Oral-B iO / Philips Sonicare handles".',
    skuScoped: true,
    minDurationDays: 5,
    maxDurationDays: 9,
    dailyProbability: 0.012,
    multipliers: { sales: 0.85, adsSpend: 1, adConversion: 1, negativeReview: 3.0 },
  },
];

export const IDENTITY_MULTIPLIERS: EventMultipliers = {
  sales: 1,
  adsSpend: 1,
  adConversion: 1,
  negativeReview: 1,
};

export function findEventTemplate(code: string): SimEventTemplate | undefined {
  return SIM_EVENT_TEMPLATES.find((template) => template.code === code);
}

/** Combined multipliers for a SKU on a given day (global events apply to all SKUs). */
export function aggregateEventMultipliers(
  activeEvents: ActiveSimEvent[],
  skuCode: string,
  dayIndex: number,
): EventMultipliers {
  const combined = { ...IDENTITY_MULTIPLIERS };
  for (const event of activeEvents) {
    if (dayIndex < event.startDayIndex || dayIndex > event.endDayIndex) continue;
    if (event.skuCode !== undefined && event.skuCode !== skuCode) continue;
    combined.sales *= event.multipliers.sales;
    combined.adsSpend *= event.multipliers.adsSpend;
    combined.adConversion *= event.multipliers.adConversion;
    combined.negativeReview *= event.multipliers.negativeReview;
  }
  return combined;
}

export function createEventFromTemplate(
  template: SimEventTemplate,
  skuCode: string | undefined,
  dayIndex: number,
  durationDays: number,
): ActiveSimEvent {
  return {
    code: template.code,
    skuCode,
    severity: template.severity,
    title: template.title,
    description: template.description,
    startDayIndex: dayIndex,
    endDayIndex: dayIndex + Math.max(0, durationDays - 1),
    multipliers: { ...template.multipliers },
    emitted: false,
  };
}

/**
 * Manually inject an event into the world (used by tests and, later, the API).
 * The 'ACTIVE' event row is emitted by the next simulateOneDay call.
 */
export function injectEvent(
  world: SimWorldState,
  code: string,
  skuCode?: string,
  durationDays?: number,
): SimWorldState {
  const template = findEventTemplate(code);
  if (!template) {
    throw new Error(`Unknown simulator event template: ${code}`);
  }
  const event = createEventFromTemplate(
    template,
    skuCode,
    world.dayIndex,
    durationDays ?? template.minDurationDays,
  );
  return { ...world, activeEvents: [...world.activeEvents, event] };
}

export interface EventEngineInput {
  world: SimWorldState;
  config: SimConfig;
}

export interface EventEngineOutput {
  eventRows: SimEventRow[];
  activeEvents: ActiveSimEvent[];
}

/**
 * Advances the event ledger for one day: expires finished events (RESOLVED
 * rows), emits ACTIVE rows for pending (e.g. injected) events, and rolls for
 * new random anomalies.
 */
export function runEventEngine(input: EventEngineInput, rng: Rng): EventEngineOutput {
  const { world, config } = input;
  const { dayIndex, simDate } = world;
  const eventRows: SimEventRow[] = [];
  const activeEvents: ActiveSimEvent[] = [];
  const rowDate = simDateToUtcDate(simDate);

  // 1. Expire events whose window has ended.
  for (const event of world.activeEvents) {
    if (dayIndex > event.endDayIndex) {
      eventRows.push({
        skuCode: event.skuCode,
        simDate: rowDate,
        code: event.code,
        severity: event.severity,
        title: event.title,
        description: event.description,
        status: 'RESOLVED',
      });
      continue;
    }
    // 2. Emit ACTIVE rows for events not yet emitted (new or injected).
    if (!event.emitted) {
      eventRows.push({
        skuCode: event.skuCode,
        simDate: rowDate,
        code: event.code,
        severity: event.severity,
        title: event.title,
        description: event.description,
        status: 'ACTIVE',
      });
    }
    activeEvents.push({ ...event, emitted: true });
  }

  // 3. Roll for new random events.
  if (config.eventDailyProbability > 0) {
    for (const template of SIM_EVENT_TEMPLATES) {
      const candidateSkus = template.skuScoped
        ? config.skus.map((sku) => sku.skuCode)
        : [undefined];
      for (const skuCode of candidateSkus) {
        if (rng() >= template.dailyProbability * config.eventDailyProbability) continue;
        const alreadyActive = activeEvents.some(
          (event) => event.code === template.code && event.skuCode === skuCode,
        );
        if (alreadyActive) continue;
        const durationDays = Math.round(
          randRange(rng, template.minDurationDays, template.maxDurationDays),
        );
        const event = createEventFromTemplate(template, skuCode, dayIndex, durationDays);
        activeEvents.push(event);
        eventRows.push({
          skuCode: event.skuCode,
          simDate: rowDate,
          code: event.code,
          severity: event.severity,
          title: event.title,
          description: event.description,
          status: 'ACTIVE',
        });
        event.emitted = true;
      }
    }
  }

  return { eventRows, activeEvents };
}
