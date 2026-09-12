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
    title: '产品上线与首批 FBA 入库',
    skuCode: 'MTH-WHITE-001',
    description: 'POLEGAS 天然大理石牙刷架在美国站（Amazon US）上线，共 3 个变体。首批 FBA 库存入库：白色（500）、绿色（400）、灰色（300）。',
    impactSummary: '共 1,200 件进入可售履约库存。',
    severity: 'INFO',
    status: 'COMPLETED',
  },
  {
    code: 'E02',
    day: 18,
    title: '广泛匹配搜索词 ACOS 飙升',
    skuCode: 'MTH-WHITE-001',
    description: 'Sponsored Products 广告活动 ACOS 走高至 31%。搜索词 "bathroom organizer" 消耗广告预算（花费 $420，成交 2 单，ACOS 93.3%）。已生成否定关键词建议。',
    impactSummary: 'ACOS 从 19% 升至 31%。',
    severity: 'WARNING',
    status: 'RESOLVED',
  },
  {
    code: 'E03',
    day: 38,
    title: '绿色 SKU 销量病毒式飙升',
    skuCode: 'MTH-GREEN-001',
    description: '社交媒体浴室装饰潮流带火翡翠绿大理石美学。日销速度从 8 件/天跳升至 35 件/天。',
    impactSummary: '绿色变体日收入翻三倍；库存消耗速度加快 4 倍。',
    severity: 'INFO',
    status: 'COMPLETED',
  },
  {
    code: 'E04',
    day: 52,
    title: '绿色 SKU 紧急补货预警',
    skuCode: 'MTH-GREEN-001',
    description: '绿色变体库存降至 120 件。按当前 10.2 件/天的动销速度，可售天数降至 11.8 天（低于 15 天供应商交期）。触发补货建议。',
    impactSummary: '若不加急采购，预计 12 天内断货。',
    severity: 'CRITICAL',
    status: 'RESOLVED',
  },
  {
    code: 'E05',
    day: 62,
    title: '绿色 SKU 库存断货',
    skuCode: 'MTH-GREEN-001',
    description: '绿色变体可售库存连续 4 天归零，直至紧急空运在途补货。自然排名下降 6 位。',
    impactSummary: '断货窗口期预计损失收入 $2,400。',
    severity: 'CRITICAL',
    status: 'RESOLVED',
  },
  {
    code: 'E06',
    day: 50,
    title: '米灰变体退货率飙升',
    skuCode: 'MTH-GREY-001',
    description: '灰色 SKU 退货率从 3.2% 飙升至 6.7%。买家退货原因集中在孔径过窄、放不进电动牙刷手柄以及底座崩边。',
    impactSummary: '退货损失达每周 $620；买家满意度评分下滑。',
    severity: 'WARNING',
    status: 'COMPLETED',
  },
  {
    code: 'E07',
    day: 55,
    title: 'VOC 主题提取：孔径缺陷',
    skuCode: 'MTH-GREY-001',
    description: 'AI VOC 分析 45 条差评，识别出主要买家投诉：31% 的买家评论抱怨「孔太小，放不下 Oral-B iO / Philips Sonicare 手柄」。',
    impactSummary: '根因已定位：孔径 1.1 英寸，市场标准 1.5 英寸。',
    severity: 'WARNING',
    status: 'COMPLETED',
  },
  {
    code: 'E08',
    day: 64,
    title: 'Listing Studio 事实更新与尺寸澄清',
    skuCode: 'MTH-GREY-001',
    description: '通过 Listing Studio 更新 Listing：标题、第 2 条要点和 A+ 图文已更新为明确尺寸："孔径：1.5 英寸（适配标准/纤细款电动牙刷）"。合规检查 PASS。',
    impactSummary: '买家预期已对齐；退货率开始企稳回落至 3.0%。',
    severity: 'INFO',
    status: 'COMPLETED',
  },
  {
    code: 'E09',
    day: 72,
    title: 'FBA 补货入库（PO-2026-003）',
    skuCode: 'MTH-GREEN-001',
    description: '绿色 SKU 500 件到达 Amazon GYR1 运营中心。可售库存恢复至 508 件，可售天数回升至 48 天。',
    impactSummary: 'Buy Box 恢复，PPC 竞价恢复至目标 ACOS。',
    severity: 'INFO',
    status: 'COMPLETED',
  },
  {
    code: 'E10',
    day: 80,
    title: '第 11 周业务复盘与瀑布归因',
    description: 'AI 业务分析师审计第 11 周净利润较第 10 周下滑 -$2,280。多智能体瀑布归因将损失分解为：广告（-$980）、退货（-$620）、库存（-$510）、价格（-$310）及其他（+140）。',
    impactSummary: '净利润差异 -$2,280 已完全分解至 5 个业务杠杆。',
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
