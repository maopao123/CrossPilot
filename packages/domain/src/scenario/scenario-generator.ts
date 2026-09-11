import { roundMoney, roundMargin } from '../profit/profit-calculation.service';

export interface BusinessEvent {
  code: string;
  day: number;
  title: string;
  skuCode?: string;
  description: string;
  impactSummary: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'COMPLETED' | 'RESOLVED' | 'ACTIVE';
}

export const CORE_BUSINESS_EVENTS: BusinessEvent[] = [
  {
    code: 'E01',
    day: 1,
    title: 'Product Launch & Initial FBA Inbound',
    skuCode: 'MTH-WHITE-001',
    description: 'POLEGAS Natural Marble Toothbrush Holder launches on Amazon US with 3 variants. Initial FBA inventory received: White (500), Green (400), Grey (300).',
    impactSummary: '1,200 total units placed into active fulfillment.',
    severity: 'INFO',
    status: 'COMPLETED',
  },
  {
    code: 'E02',
    day: 18,
    title: 'ACOS Spike on Broad Search Terms',
    skuCode: 'MTH-WHITE-001',
    description: 'Sponsored Products campaign shows rising ACOS (31%). Search term "bathroom organizer" drains ad budget ($420 spend, 2 orders, ACOS 93.3%). Negative keyword recommendation generated.',
    impactSummary: 'ACOS climbs from 19% to 31%.',
    severity: 'WARNING',
    status: 'RESOLVED',
  },
  {
    code: 'E03',
    day: 38,
    title: 'Green SKU Viral Sales Surge',
    skuCode: 'MTH-GREEN-001',
    description: 'Social bathroom decor trend highlights Emerald Green marble aesthetic. Daily sales velocity jumps from 8 units/day to 35 units/day.',
    impactSummary: 'Daily revenue triples for Green variant; inventory drawdown accelerates 4x.',
    severity: 'INFO',
    status: 'COMPLETED',
  },
  {
    code: 'E04',
    day: 52,
    title: 'Green SKU Critical Reorder Warning',
    skuCode: 'MTH-GREEN-001',
    description: 'Green variant stock drops to 120 units. At current velocity of 10.2 units/day, Days Cover drops to 11.8 days (< 15 days supplier lead time). Reorder recommendation triggers.',
    impactSummary: 'Stockout risk projected within 12 days without expedited PO.',
    severity: 'CRITICAL',
    status: 'RESOLVED',
  },
  {
    code: 'E05',
    day: 62,
    title: 'Green SKU Inventory Stockout',
    skuCode: 'MTH-GREEN-001',
    description: 'Green variant fulfillable inventory hits zero for 4 consecutive days before emergency air shipment transit. Organic ranking drops 6 positions.',
    impactSummary: 'Estimated $2,400 lost revenue across stockout window.',
    severity: 'CRITICAL',
    status: 'RESOLVED',
  },
  {
    code: 'E06',
    day: 50,
    title: 'Beige Grey Variant Return Rate Spike',
    skuCode: 'MTH-GREY-001',
    description: 'Return rate for Grey SKU spikes from 3.2% to 6.7%. Customer returns cite hole diameter too narrow for electric toothbrush handles and base chipping.',
    impactSummary: 'Return loss reaches $620 weekly; customer satisfaction score dips.',
    severity: 'WARNING',
    status: 'COMPLETED',
  },
  {
    code: 'E07',
    day: 55,
    title: 'VOC Topic Extraction: Hole-Size Defect',
    skuCode: 'MTH-GREY-001',
    description: 'AI VOC analysis of 45 negative reviews identifies primary customer complaint: 31% of reviews complain "hole too small for Oral-B iO / Philips Sonicare handles".',
    impactSummary: 'Root cause identified: slot diameter 1.1 inch vs market standard 1.5 inch.',
    severity: 'WARNING',
    status: 'COMPLETED',
  },
  {
    code: 'E08',
    day: 64,
    title: 'Listing Studio Fact Update & Dimension Clarification',
    skuCode: 'MTH-GREY-001',
    description: 'Listing updated via Listing Studio: Title, bullet point 2, and A+ graphics updated with explicit dimensions: "Hole Diameter: 1.5 in (Fits Standard & Slim Electric)". Compliance check PASS.',
    impactSummary: 'Buyer expectation aligned; return rate begins stabilizing towards 3.0%.',
    severity: 'INFO',
    status: 'COMPLETED',
  },
  {
    code: 'E09',
    day: 72,
    title: 'FBA Replenishment Received (PO-2026-003)',
    skuCode: 'MTH-GREEN-001',
    description: '500 units of Green SKU received at Amazon GYR1 fulfillment center. Available inventory restored to 508 units, Days Cover rebounds to 48 days.',
    impactSummary: 'Buy Box reinstated, PPC bidding resumes at target ACOS.',
    severity: 'INFO',
    status: 'COMPLETED',
  },
  {
    code: 'E10',
    day: 80,
    title: 'Week 11 Business Review & Waterfall Attribution',
    description: 'AI Business Analyst audits Week 11 net profit decline of -$2,280 vs Week 10. Multi-agent waterfall attributes loss to Ads (-$980), Returns (-$620), Inventory (-$510), Price (-$310), and Other (+140).',
    impactSummary: 'Net Profit variance -$2,280 completely decomposed across 5 business levers.',
    severity: 'WARNING',
    status: 'ACTIVE',
  },
];

export interface DailyScenarioMetrics {
  day: number;
  date: string;
  skuCode: string;
  ordersCount: number;
  unitsSold: number;
  price: number;
  revenue: number;
  cogs: number;
  adsCost: number;
  amazonFees: number;
  fbaFee: number;
  returnLoss: number;
  otherCosts: number;
  netProfit: number;
  margin: number;
  inventoryFulfillable: number;
  inventoryReserved: number;
  inventoryInbound: number;
  daysCover: number;
}

export interface DayAggregatedMetrics {
  day: number;
  date: string;
  totalOrders: number;
  totalRevenue: number;
  totalAdsCost: number;
  totalNetProfit: number;
  margin: number;
  events: BusinessEvent[];
}

export class ScenarioGeneratorService {
  /**
   * Generates a 90-day deterministic dataset for POLEGAS Toothbrush Holder.
   * Base startDate defaults to 90 days before today.
   */
  static generate90Days(startDate?: Date): {
    days: DayAggregatedMetrics[];
    skuMetrics: DailyScenarioMetrics[];
    events: BusinessEvent[];
    waterfallWeek11: {
      week10Profit: number;
      week11Profit: number;
      variance: number;
      breakdown: {
        advertising: number;
        returns: number;
        inventory: number;
        price: number;
        other: number;
      };
      formula: string;
    };
  } {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const skuMetrics: DailyScenarioMetrics[] = [];
    const aggregatedDays: DayAggregatedMetrics[] = [];

    // Base inventory trackers
    let whiteInv = 500;
    let greenInv = 400;
    let greyInv = 300;

    let greenInbound = 0;

    for (let day = 1; day <= 90; day++) {
      const currentDate = new Date(start.getTime() + (day - 1) * 24 * 60 * 60 * 1000);
      const dateStr = currentDate.toISOString().split('T')[0];

      // Inventory replenishment events
      if (day === 30) whiteInv += 400;
      if (day === 55) greenInbound = 500;
      if (day === 72) {
        greenInv += 500;
        greenInbound = 0;
      }
      if (day === 65) greyInv += 250;

      // 1. White SKU (MTH-WHITE-001) - Hero SKU, steady growth
      const whitePrice = (day >= 73 && day <= 79) ? 26.99 : 29.99; // Promo discount in Week 11
      const whiteUnits = Math.round(14 + Math.sin(day / 5) * 3 + (day > 60 ? 4 : 0));
      whiteInv = Math.max(0, whiteInv - whiteUnits);
      const whiteRev = roundMoney(whiteUnits * whitePrice);
      const whiteCogs = roundMoney(whiteUnits * 6.50);
      const whiteAmzFee = roundMoney(whiteRev * 0.15);
      const whiteFba = roundMoney(whiteUnits * 5.40);
      const whiteAds = roundMoney(whiteRev * (day >= 71 && day <= 77 ? 0.28 : 0.16));
      const whiteRetLoss = roundMoney(day % 4 === 0 ? whitePrice * 0.9 : 0);
      const whiteOther = 0;
      const whiteProfit = roundMoney(whiteRev - whiteCogs - whiteAmzFee - whiteFba - whiteAds - whiteRetLoss - whiteOther);
      const whiteDaysCover = whiteUnits > 0 ? roundMoney(whiteInv / 15) : 99;

      skuMetrics.push({
        day,
        date: dateStr,
        skuCode: 'MTH-WHITE-001',
        ordersCount: whiteUnits,
        unitsSold: whiteUnits,
        price: whitePrice,
        revenue: whiteRev,
        cogs: whiteCogs,
        adsCost: whiteAds,
        amazonFees: whiteAmzFee,
        fbaFee: whiteFba,
        returnLoss: whiteRetLoss,
        otherCosts: whiteOther,
        netProfit: whiteProfit,
        margin: whiteRev > 0 ? roundMargin(whiteProfit / whiteRev) : 0,
        inventoryFulfillable: whiteInv,
        inventoryReserved: Math.round(whiteUnits * 1.5),
        inventoryInbound: 0,
        daysCover: whiteDaysCover,
      });

      // 2. Green SKU (MTH-GREEN-001) - Spike, stockout, replenishment
      const greenPrice = 32.99;
      let greenUnits = 8;
      if (day >= 35 && day <= 48) {
        // Viral surge
        greenUnits = Math.round(26 + (day - 35) * 1.2);
      } else if (day >= 49 && day <= 59) {
        greenUnits = 14;
      } else if (day >= 60 && day <= 67) {
        // Stockout period
        greenUnits = Math.min(greenInv, 2);
      } else if (day >= 68) {
        greenUnits = 16;
      }

      greenInv = Math.max(0, greenInv - greenUnits);
      const greenRev = roundMoney(greenUnits * greenPrice);
      const greenCogs = roundMoney(greenUnits * 7.20);
      const greenAmzFee = roundMoney(greenRev * 0.15);
      const greenFba = roundMoney(greenUnits * 5.60);
      const greenAds = roundMoney(greenRev * (day >= 35 && day <= 48 ? 0.22 : 0.14));
      const greenRetLoss = roundMoney(day % 6 === 0 ? greenPrice * 0.9 : 0);
      // Expedited air freight charge in Week 11 for emergency restock
      const greenOther = (day >= 71 && day <= 77) ? 45.0 : 0;
      const greenProfit = roundMoney(greenRev - greenCogs - greenAmzFee - greenFba - greenAds - greenRetLoss - greenOther);
      const greenDaysCover = greenUnits > 0 ? roundMoney(greenInv / (day >= 35 ? 18 : 10)) : 0;

      skuMetrics.push({
        day,
        date: dateStr,
        skuCode: 'MTH-GREEN-001',
        ordersCount: greenUnits,
        unitsSold: greenUnits,
        price: greenPrice,
        revenue: greenRev,
        cogs: greenCogs,
        adsCost: greenAds,
        amazonFees: greenAmzFee,
        fbaFee: greenFba,
        returnLoss: greenRetLoss,
        otherCosts: greenOther,
        netProfit: greenProfit,
        margin: greenRev > 0 ? roundMargin(greenProfit / greenRev) : 0,
        inventoryFulfillable: greenInv,
        inventoryReserved: Math.round(greenUnits * 1.2),
        inventoryInbound: greenInbound,
        daysCover: greenDaysCover,
      });

      // 3. Grey SKU (MTH-GREY-001) - High returns, hole size issue
      const greyPrice = 28.99;
      const greyUnits = Math.round(6 + Math.cos(day / 7) * 2);
      greyInv = Math.max(0, greyInv - greyUnits);
      const greyRev = roundMoney(greyUnits * greyPrice);
      const greyCogs = roundMoney(greyUnits * 6.20);
      const greyAmzFee = roundMoney(greyRev * 0.15);
      const greyFba = roundMoney(greyUnits * 5.40);
      const greyAds = roundMoney(greyRev * 0.20);
      // High return loss between day 45 and 75
      const greyRetLoss = roundMoney((day >= 45 && day <= 75 ? greyUnits * 0.25 : 0.05) * greyPrice);
      const greyOther = 0;
      const greyProfit = roundMoney(greyRev - greyCogs - greyAmzFee - greyFba - greyAds - greyRetLoss - greyOther);
      const greyDaysCover = greyUnits > 0 ? roundMoney(greyInv / 7) : 99;

      skuMetrics.push({
        day,
        date: dateStr,
        skuCode: 'MTH-GREY-001',
        ordersCount: greyUnits,
        unitsSold: greyUnits,
        price: greyPrice,
        revenue: greyRev,
        cogs: greyCogs,
        adsCost: greyAds,
        amazonFees: greyAmzFee,
        fbaFee: greyFba,
        returnLoss: greyRetLoss,
        otherCosts: greyOther,
        netProfit: greyProfit,
        margin: greyRev > 0 ? roundMargin(greyProfit / greyRev) : 0,
        inventoryFulfillable: greyInv,
        inventoryReserved: Math.round(greyUnits * 1.1),
        inventoryInbound: 0,
        daysCover: greyDaysCover,
      });

      // Daily Aggregations
      const dayOrders = whiteUnits + greenUnits + greyUnits;
      const dayRev = roundMoney(whiteRev + greenRev + greyRev);
      const dayAds = roundMoney(whiteAds + greenAds + greyAds);
      const dayProfit = roundMoney(whiteProfit + greenProfit + greyProfit);
      const dayEvents = CORE_BUSINESS_EVENTS.filter((e) => e.day === day);

      aggregatedDays.push({
        day,
        date: dateStr,
        totalOrders: dayOrders,
        totalRevenue: dayRev,
        totalAdsCost: dayAds,
        totalNetProfit: dayProfit,
        margin: dayRev > 0 ? roundMargin(dayProfit / dayRev) : 0,
        events: dayEvents,
      });
    }

    // Week 10 (Days 64-70) vs Week 11 (Days 71-77) Deterministic Waterfall Attribution:
    // Required: -2280 = -980 - 620 - 510 - 310 + 140
    const waterfallWeek11 = {
      week10Profit: 4120.00,
      week11Profit: 1840.00,
      variance: -2280.00,
      breakdown: {
        advertising: -980.00, // Budget leak on broad keyword 'bathroom organizer' + ACOS surge
        returns: -620.00,     // Beige Grey return spike refunds & processing fees
        inventory: -510.00,   // Green SKU stockout lost margin + expedited air freight
        price: -310.00,       // Promotional flash coupon discount on White SKU
        other: 140.00,        // Supplier carton rebate & packaging optimization savings
      },
      formula: '-2280 = -980 - 620 - 510 - 310 + 140',
    };

    return {
      days: aggregatedDays,
      skuMetrics,
      events: CORE_BUSINESS_EVENTS,
      waterfallWeek11,
    };
  }
}
