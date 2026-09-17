import {
  CORE_SPEC_FIELDS,
  ProductCandidate,
  ProductSpecification,
  SupplierQuote,
} from '@crosspilot/shared';
import {
  CandidateDecisionEngine,
  CandidateEconomicsService,
  DecisionPacketService,
  InitialCashService,
  NextBestActionEngine,
  RfqGeneratorService,
  RiskApplicabilityPolicy,
  SpecificationManager,
  SupplierQuoteService,
} from '../src/research/index.js';

describe('CrossPilot Single-Product Research V1 Acceptance Suite (工程增强修订)', () => {
  // Test fixture generator
  function createTestCandidate(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
    const candidateId = 'cand-glass-fruit-box-001';
    const spec = SpecificationManager.createDraftSpecification(candidateId, {
      material: '玻璃主体 + PP 沥水篮',
      capacity: '约 1.5L',
      dimensions: '25 × 15 × 10 cm',
      targetSellingPrice: 29.99,
      specialRequirements: ['可拆卸沥水篮', '易清洁结构'],
    });

    const frozenSpec = SpecificationManager.freezeSpecification(spec);

    return {
      id: candidateId,
      title: '玻璃水果保鲜盒 + 沥水篮',
      marketplace: 'amazon-us',
      category: 'Kitchen & Dining',
      concept: {
        productType: '玻璃水果保鲜盒 + 沥水篮',
        targetCustomer: '注重健康保鲜与高品质家居生活的北美中产家庭',
        useCase: '水果洗净沥水、冰箱冷藏保鲜与餐桌直接伺服',
        targetPrice: 29.99,
        specifications: {
          material: '高硼硅玻璃 + 食品级 PP',
          capacity: '1.5L',
        },
      },
      specifications: [frozenSpec],
      activeSpecVersionId: frozenSpec.id,
      marketResearch: {
        seedKeyword: 'glass fruit container with colander',
        searchVolumeMonthly: 28500,
        competitiveDifficulty: 42,
        opportunityScore: 78,
      },
      economics: {
        status: 'INCOMPLETE',
        currency: 'USD',
        inputs: {
          sellingPrice: { value: 29.99, source: 'FACT' },
          productCost: { value: null, source: 'UNKNOWN' },
          referralFeeRate: { value: 0.15, source: 'FACT' },
          fbaFeePerUnit: { value: 4.8, source: 'ESTIMATE' },
          freightPerUnit: { value: 1.8, source: 'ESTIMATE' },
          dutyPerUnit: { value: 0.4, source: 'ESTIMATE' },
          adsCostPerUnit: { value: 3.5, source: 'ESTIMATE' },
          returnRate: { value: 0.05, source: 'ASSUMPTION' },
          returnLossPerUnit: { value: 4.8, source: 'ESTIMATE' },
          storageFeePerUnit: { value: 0.25, source: 'ESTIMATE' },
          otherCostsPerUnit: { value: 0, source: 'FACT' },
        },
        scenarios: {
          conservative: {} as any,
          base: {} as any,
          optimistic: {} as any,
        },
        missingInputs: ['productCost'],
      },
      risks: [],
      evidence: [],
      assumptions: [],
      missingRequirements: [],
      decision: 'INSUFFICIENT_DATA',
      ...overrides,
    };
  }

  describe('P0-1: 核心规格字段与冻结规则 (CORE_SPEC_FIELDS & Spec Freezing)', () => {
    it('明确在代码层定义 CORE_SPEC_FIELDS 四大字段', () => {
      expect(CORE_SPEC_FIELDS).toEqual([
        'material',
        'capacity',
        'dimensions',
        'targetSellingPrice',
      ]);
      expect(CORE_SPEC_FIELDS.length).toBe(4);
    });

    it('新建规格为 DRAFT 状态，冻结前必须校验核心 4 字段非空', () => {
      const spec = SpecificationManager.createDraftSpecification('cand-1', {
        material: '高硼硅玻璃',
        capacity: '1.5L',
        dimensions: '25x15x10cm',
        targetSellingPrice: 29.99,
      });

      expect(spec.status).toBe('DRAFT');
      expect(spec.version).toBe(1);

      // 冻结成功
      const frozen = SpecificationManager.freezeSpecification(spec);
      expect(frozen.status).toBe('FROZEN');
      expect(frozen.frozenAt).toBeDefined();

      // 缺失核心字段时拒绝冻结
      const invalidSpec = SpecificationManager.createDraftSpecification('cand-1', {
        material: '',
        capacity: '1.5L',
        dimensions: '25x15x10cm',
        targetSellingPrice: 0,
      });

      expect(() => SpecificationManager.freezeSpecification(invalidSpec)).toThrow(
        /无法冻结规格进入询价/,
      );
    });
  });

  describe('P0-2: 生成可复制询价单 (Copyable RFQ Generation)', () => {
    it('生成标准可复制中文询价单，包含产品方案、核心需求与工厂详细清单', () => {
      const candidate = createTestCandidate();
      const spec = candidate.specifications![0];

      const rfq = RfqGeneratorService.generateRfq(candidate, spec);

      expect(rfq.candidateId).toBe(candidate.id);
      expect(rfq.specVersionId).toBe(spec.id);
      expect(rfq.inquiryItems).toContain('单价 (含出厂标准包装)');
      expect(rfq.inquiryItems).toContain('最小起订量 (MOQ)');
      expect(rfq.inquiryItems).toContain('外箱装箱数 (每箱几件)');
      expect(rfq.copyableText).toContain('玻璃水果保鲜盒 + 沥水篮');
      expect(rfq.copyableText).toContain('玻璃主体 + PP 沥水篮');
      expect(rfq.copyableText).toContain('25 × 15 × 10 cm');
      expect(rfq.copyableText).toContain('阶梯单价');
    });
  });

  describe('P0-3 & P0-4: 3 家工厂报价、来源追溯与事实标签 (Supplier Quotes & Badges)', () => {
    it('能录入 3 家工厂报价，并精准打上客观事实标签，严禁隐形综合最优评分', () => {
      const specId = 'cand-glass-fruit-box-001-spec-v1';
      const quoteA: SupplierQuote = {
        id: 'quote-a',
        candidateId: 'cand-glass-fruit-box-001',
        specVersionId: specId,
        supplierName: 'A厂 (浙江台州某塑料模具玻璃制品厂)',
        status: 'ACTIVE',
        unitPrice: 42,
        packagingCost: { value: 3, source: 'FACT' },
        logoCost: { value: 1, source: 'FACT' },
        moq: 500,
        sampleCost: 100,
        toolingCost: 0,
        leadTimeDays: 25,
        captureMethod: 'MANUAL',
        sourceChannel: '1688',
        currency: 'CNY',
        capturedAt: new Date().toISOString(),
      };

      const quoteB: SupplierQuote = {
        id: 'quote-b',
        candidateId: 'cand-glass-fruit-box-001',
        specVersionId: specId,
        supplierName: 'B厂 (广东潮州某高硼硅玻璃厂)',
        status: 'ACTIVE',
        unitPrice: 45,
        packagingCost: { value: 2, source: 'FACT' },
        logoCost: { value: 1, source: 'FACT' },
        moq: 300,
        sampleCost: 150,
        toolingCost: 0,
        leadTimeDays: 30,
        captureMethod: 'MANUAL',
        sourceChannel: 'WECHAT',
        currency: 'CNY',
        capturedAt: new Date().toISOString(),
      };

      const quoteC: SupplierQuote = {
        id: 'quote-c',
        candidateId: 'cand-glass-fruit-box-001',
        specVersionId: specId,
        supplierName: 'C厂 (江苏南通某外贸综合厂)',
        status: 'ACTIVE',
        unitPrice: 39,
        packagingCost: { value: 4, source: 'FACT' },
        logoCost: { value: 1, source: 'FACT' },
        moq: 1000,
        sampleCost: 80,
        toolingCost: 0,
        leadTimeDays: 20,
        captureMethod: 'MANUAL',
        sourceChannel: 'ALIBABA',
        currency: 'CNY',
        capturedAt: new Date().toISOString(),
      };

      const badges = SupplierQuoteService.calculateFactBadges([quoteA, quoteB, quoteC]);

      // B厂 MOQ 最低 (300)
      const bBadges = badges.filter((b) => b.quoteId === 'quote-b');
      expect(bBadges.map((b) => b.badgeType)).toContain('LOWEST_MOQ');
      expect(bBadges.find((b) => b.badgeType === 'LOWEST_MOQ')?.labelZh).toBe('MOQ 最低');

      // C厂 单价最低 (39) 且 交期最短 (20天)
      const cBadges = badges.filter((b) => b.quoteId === 'quote-c');
      expect(cBadges.map((b) => b.badgeType)).toContain('LOWEST_PRICE');
      expect(cBadges.map((b) => b.badgeType)).toContain('SHORTEST_LEAD_TIME');

      // 绝不允许包含“综合最优”或隐形打分
      const allLabels = badges.map((b) => b.labelZh);
      expect(allLabels).not.toContain('综合最优');
      expect(allLabels).not.toContain('最均衡');
    });
  });

  describe('P0-5 & P0-6: 选定主要报价、分项保留与 FX 汇率折算 (ProductCost & FX)', () => {
    it('正确推导 ProductCost = unitPrice + packagingCost + logoCost，并排除样品费和模具费', () => {
      const candidate = createTestCandidate();
      const specId = candidate.activeSpecVersionId!;

      const quoteA: SupplierQuote = {
        id: 'quote-a',
        candidateId: candidate.id,
        specVersionId: specId,
        supplierName: 'A厂',
        status: 'ACTIVE',
        unitPrice: 42,
        packagingCost: { value: 3, source: 'FACT' },
        logoCost: { value: 1, source: 'FACT' },
        moq: 500,
        sampleCost: 100, // 一次性投入，严禁塞入单件 productCost
        toolingCost: 2000, // 一次性投入，严禁塞入单件 productCost
        leadTimeDays: 25,
        captureMethod: 'MANUAL',
        sourceChannel: '1688',
        currency: 'CNY',
        capturedAt: new Date().toISOString(),
      };

      candidate.supplierQuotes = [quoteA];
      candidate.fxSnapshot = {
        currencyPair: 'CNY_USD',
        rate: 0.14,
        source: 'PBOC_BENCHMARK',
        capturedAt: new Date().toISOString(),
      };

      const result = SupplierQuoteService.selectPrimaryQuote(candidate, 'quote-a');

      // CNY ProductCost: 42 + 3 + 1 = 46.00 (不含 100 样品与 2000 模具)
      expect(result.productCostCny).toBe(46.0);
      expect(result.breakdown).toEqual({
        unitPrice: 42,
        packagingCost: 3,
        logoCost: 1,
      });

      // USD ProductCost: 46 * 0.14 = 6.44
      expect(result.productCostUsd).toBe(6.44);
      expect(result.candidate.primaryQuoteId).toBe('quote-a');
      expect(result.candidate.economics.inputs.productCost.value).toBe(6.44);
      expect(result.candidate.economics.inputs.productCost.source).toBe('FACT');
    });
  });

  describe('Section 16: 草稿报价防投机 (Quote Draft UNKNOWN ≠ 0)', () => {
    it('若包装费或 Logo 费为 UNKNOWN，点击算账时必须明确拦截，禁止偷偷当 0 处理', () => {
      const candidate = createTestCandidate();
      const quoteIncomplete: SupplierQuote = {
        id: 'quote-draft',
        candidateId: candidate.id,
        specVersionId: candidate.activeSpecVersionId!,
        supplierName: '未确认费用的工厂',
        status: 'ACTIVE',
        unitPrice: 40,
        packagingCost: { value: null, source: 'UNKNOWN' }, // 未知包装费
        logoCost: { value: 0, source: 'FACT' },
        moq: 500,
        captureMethod: 'MANUAL',
        sourceChannel: '1688',
        currency: 'CNY',
        capturedAt: new Date().toISOString(),
      };

      candidate.supplierQuotes = [quoteIncomplete];

      // 未明确确认时抛出错误
      expect(() =>
        SupplierQuoteService.selectPrimaryQuote(candidate, 'quote-draft'),
      ).toThrow(/包装费用.*UNKNOWN.*禁止隐式按 0 计算/);

      // 用户明确确认为 0 元（工厂包邮包普通白盒）后方可算账
      const confirmedResult = SupplierQuoteService.selectPrimaryQuote(
        candidate,
        'quote-draft',
        { packagingCost: 0 },
      );
      expect(confirmedResult.productCostCny).toBe(40.0);
      expect(confirmedResult.primaryQuote.packagingCost.source).toBe('FACT');
    });
  });

  describe('P0-7: 报价自动回填非核心规格 (Backfill Non-core Specs)', () => {
    it('工厂返回实测毛净重与箱规时，自动回填至当前 Spec，版本不变', () => {
      const candidate = createTestCandidate();
      const currentSpec = candidate.specifications![0];

      const returnedSpecs = {
        netWeight: 650,
        packagingDimensions: '26 × 16 × 11 cm',
        packagedWeight: 780,
        unitsPerCarton: 16,
        cartonDimensions: '54 × 34 × 46 cm',
        cartonGrossWeight: 13.5,
      };

      const updatedSpec = SpecificationManager.backfillFromQuote(currentSpec, returnedSpecs);

      expect(updatedSpec.version).toBe(1);
      expect(updatedSpec.status).toBe('FROZEN');
      expect(updatedSpec.netWeight?.value).toBe(650);
      expect(updatedSpec.netWeight?.source).toBe('FACT');
      expect(updatedSpec.cartonGrossWeight?.value).toBe(13.5);
      expect(updatedSpec.unitsPerCarton?.value).toBe(16);
    });
  });

  describe('P0-8: 核心规格修改失效机制 (Core Spec Invalidation)', () => {
    it('若修改非核心字段，就地更新，关联 Quote 保持 ACTIVE', () => {
      const candidate = createTestCandidate();
      const currentSpec = candidate.specifications![0];
      const quote: SupplierQuote = {
        id: 'quote-1',
        candidateId: candidate.id,
        specVersionId: currentSpec.id,
        supplierName: '工厂1',
        status: 'ACTIVE',
        unitPrice: 40,
        packagingCost: { value: 0, source: 'FACT' },
        logoCost: { value: 0, source: 'FACT' },
        moq: 500,
        captureMethod: 'MANUAL',
        sourceChannel: '1688',
        currency: 'CNY',
        capturedAt: new Date().toISOString(),
      };

      const result = SpecificationManager.updateSpecification(
        currentSpec,
        { specialRequirements: ['改用抗跌落卡扣'] },
        [quote],
      );

      expect(result.isNewVersion).toBe(false);
      expect(result.updatedSpec.version).toBe(1);
      expect(result.invalidatedQuotes[0].status).toBe('ACTIVE');
    });

    it('若修改 CORE_SPEC_FIELDS 中任一字段，自动生成 Spec V2 草稿，旧 Quote 全部变为 STALE', () => {
      const candidate = createTestCandidate();
      const currentSpec = candidate.specifications![0];
      const quote: SupplierQuote = {
        id: 'quote-1',
        candidateId: candidate.id,
        specVersionId: currentSpec.id,
        supplierName: '工厂1',
        status: 'ACTIVE',
        unitPrice: 42,
        packagingCost: { value: 3, source: 'FACT' },
        logoCost: { value: 1, source: 'FACT' },
        moq: 500,
        captureMethod: 'MANUAL',
        sourceChannel: '1688',
        currency: 'CNY',
        capturedAt: new Date().toISOString(),
      };

      // 修改尺寸: 25cm -> 27cm
      const result = SpecificationManager.updateSpecification(
        currentSpec,
        { dimensions: '27 × 16 × 12 cm' },
        [quote],
      );

      expect(result.isNewVersion).toBe(true);
      expect(result.updatedSpec.version).toBe(2);
      expect(result.updatedSpec.status).toBe('DRAFT');
      expect(result.invalidatedQuotes[0].status).toBe('STALE');
      expect(result.invalidationNotice).toContain('核心规格发生变更');

      // 若尝试选择 STALE 的报价算账，SupplierQuoteService 坚决阻断
      candidate.supplierQuotes = result.invalidatedQuotes;
      expect(() => SupplierQuoteService.selectPrimaryQuote(candidate, 'quote-1')).toThrow(
        /针对的是历史规格 \(STALE\)/,
      );
    });
  });

  describe('P0-10 & P0-11: 单件经济模型 vs 首单启动资金独立性 (Unit Economics vs Initial Cash)', () => {
    it('领域层严格分离：单件利润算边际贡献，启动资金算首单真金白银门槛', () => {
      // 1. 单件利润测算
      const economics = CandidateEconomicsService.calculateEconomics(
        {
          sellingPrice: { value: 29.99, source: 'FACT' },
          productCost: { value: 6.44, source: 'FACT' }, // ¥46 @ 0.14
          referralFeeRate: { value: 0.15, source: 'FACT' }, // $4.50
          fbaFeePerUnit: { value: 4.8, source: 'ESTIMATE' },
          freightPerUnit: { value: 1.8, source: 'ESTIMATE' },
          dutyPerUnit: { value: 0.4, source: 'ESTIMATE' },
          adsCostPerUnit: { value: 3.0, source: 'ESTIMATE' },
          returnRate: { value: 0.05, source: 'ASSUMPTION' },
          returnLossPerUnit: { value: 4.8, source: 'ESTIMATE' }, // $0.24
          storageFeePerUnit: { value: 0.17, source: 'ESTIMATE' },
          otherCostsPerUnit: { value: 0, source: 'FACT' },
        },
        'USD',
      );

      expect(economics.status).toBe('COMPLETE');
      const base = economics.scenarios.base;
      // Total expenses: 6.44 + 4.50 + 4.80 + 1.80 + 0.40 + 3.00 + 0.24 + 0.17 = 21.35
      // Profit: 29.99 - 21.35 = 8.64
      expect(base.contributionProfit).toBe(8.64);
      expect(base.contributionMargin).toBe(0.2881);

      // 2. 首单启动资金测算 (CNY) - 齐备情形 (MOQ 500, ¥46.00, 样品 ¥150, 首批头程 ¥6,429, 制版 ¥300)
      const initialCashComplete = InitialCashService.calculateInitialCash({
        moq: 500,
        productCostPerUnit: 46.0,
        sampleCost: 150,
        firstFreightCost: 6429,
        toolingCost: 0,
        packagingSetupCost: 300,
        currency: 'CNY',
      });

      // Total cash = 500 * 46 (23,000) + 150 (样品) + 6,429 (运费) + 300 (制版) = 29,879
      expect(initialCashComplete.status).toBe('COMPLETE');
      expect(initialCashComplete.inventoryCost).toBe(23000);
      expect(initialCashComplete.totalInitialCash).toBe(29879);
      expect(initialCashComplete.displaySummaryZh).toContain('2.99 万');
      expect(initialCashComplete.breakdown.length).toBe(4);

      // P0-1 闭环: 缺样品费或首批头程时，坚决拦截并标记 INCOMPLETE，禁止把单纯采购货款当成启动资金
      const initialCashIncomplete = InitialCashService.calculateInitialCash({
        moq: 500,
        productCostPerUnit: 46.0,
        sampleCost: null,
        firstFreightCost: undefined,
        currency: 'CNY',
      });

      expect(initialCashIncomplete.status).toBe('INCOMPLETE');
      expect(initialCashIncomplete.totalInitialCash).toBeNull();
      expect(initialCashIncomplete.missingItems).toEqual(['样品费', '首批头程']);
      expect(initialCashIncomplete.displaySummaryZh).toBe('首单资金还算不全：缺样品费/首批头程');
    });
  });

  describe('P0-12 & P0-13: 风险适用性与证据硬门禁 (Risk Applicability & Gate)', () => {
    it('玻璃水果保鲜盒自动映射食品接触、易碎与专利风险，默认 UNVERIFIED，玻璃显式生成 Assumption', () => {
      const concept = {
        productType: '高硼硅玻璃水果保鲜盒 + 沥水篮',
        useCase: '果蔬保鲜清洗',
        specifications: { material: '高硼硅玻璃 + PP' },
      };

      const { applicableRisks, assumptions } = RiskApplicabilityPolicy.determineApplicability(
        concept,
        'Kitchen',
      );

      expect(applicableRisks.some((r) => r.category === 'PATENT')).toBe(true);
      expect(applicableRisks.some((r) => r.riskId === 'risk-food-contact')).toBe(true);
      expect(applicableRisks.some((r) => r.riskId === 'risk-fragile-packaging')).toBe(true);
      expect(applicableRisks.every((r) => r.status === 'UNVERIFIED')).toBe(true);

      // 玻璃显式生成 Assumption，而不是后台偷偷乘 1.3
      const glassAsm = assumptions.find((a) => a.id === 'asm-glass-packaging-protection');
      expect(glassAsm).toBeDefined();
      expect(glassAsm?.field).toBe('returnRate');
      expect(glassAsm?.impactLevel).toBe('HIGH');
    });

    it('风险项未核验时，决不能直接判为 SHORTLIST，必须降级为待验证 (NEEDS_VALIDATION)', () => {
      const candidate = createTestCandidate();
      // 完备的财务数据
      candidate.economics = CandidateEconomicsService.calculateEconomics({
        sellingPrice: { value: 29.99, source: 'FACT' },
        productCost: { value: 6.44, source: 'FACT' },
        referralFeeRate: { value: 0.15, source: 'FACT' },
        fbaFeePerUnit: { value: 4.8, source: 'ESTIMATE' },
        freightPerUnit: { value: 1.8, source: 'ESTIMATE' },
      });

      // 存在未核验风险
      candidate.risks = [
        {
          riskId: 'risk-patent-check',
          category: 'PATENT',
          title: '专利排查',
          status: 'UNVERIFIED',
          severity: 'HIGH',
          evidenceIds: [],
        },
      ];

      const decision = CandidateDecisionEngine.evaluate(candidate);
      expect(decision.verdict).toBe('NEEDS_VALIDATION');
      expect(decision.reasons.some((r) => r.includes('未核验风险项'))).toBe(true);
    });
  });

  describe('P0-14: Next Best Action 确定性 5 级优先级 (Deterministic Priority)', () => {
    it('优先级 1: 致命阻断时，返回停止推进 (STOP)', () => {
      const candidate = createTestCandidate({
        decision: 'BLOCKED',
        decisionDetail: {
          verdict: 'BLOCKED',
          reasons: ['基准财务测算亏损: 边际贡献 -$1.50，财务不可行'],
          evidenceCoverageHeuristic: 0.8,
          hardRiskGatePassed: false,
          economicsGatePassed: false,
          evaluatedAt: new Date().toISOString(),
        },
      });

      const nba = NextBestActionEngine.getNextBestAction(candidate);
      expect(nba?.priority).toBe(1);
      expect(nba?.actionType).toBe('STOP');
      expect(nba?.category).toBe('BLOCKED_STOP');
    });

    it('优先级 2: 严格遵守单动作规则，先推食品接触材料，核验后再推专利排查，严禁合并文案', () => {
      const candidate = createTestCandidate({
        risks: [
          {
            riskId: 'risk-food-contact',
            category: 'COMPLIANCE',
            title: '食品接触认证',
            status: 'UNVERIFIED',
            severity: 'HIGH',
            evidenceIds: [],
          },
          {
            riskId: 'risk-patent',
            category: 'PATENT',
            title: '外观与实用专利',
            status: 'UNVERIFIED',
            severity: 'HIGH',
            evidenceIds: [],
          },
        ],
      });

      // 阶段 1: 两个都未核验时，先推食品接触报告
      const nbaStep1 = NextBestActionEngine.getNextBestAction(candidate);
      expect(nbaStep1?.priority).toBe(2);
      expect(nbaStep1?.category).toBe('RISK_VERIFICATION');
      expect(nbaStep1?.targetField).toBe('FOOD_CONTACT');
      expect(nbaStep1?.title).toBe('向工厂索取食品接触材料报告 (FDA/合规证明)');
      expect(nbaStep1?.title).not.toContain('专利');

      // 阶段 2: 食品接触核验通过 (PASS) 后，下一轮再单推专利排查
      candidate.risks![0].status = 'PASS';
      const nbaStep2 = NextBestActionEngine.getNextBestAction(candidate);
      expect(nbaStep2?.priority).toBe(2);
      expect(nbaStep2?.category).toBe('RISK_VERIFICATION');
      expect(nbaStep2?.targetField).toBe('PATENT');
      expect(nbaStep2?.title).toBe('检索目标市场外观与实用新型专利 (USPTO)');
      expect(nbaStep2?.title).not.toContain('食品接触');
    });

    it('优先级 3: 缺少关键财务数据时，推荐录入工厂报价或运费', () => {
      const candidate = createTestCandidate({
        risks: [],
        economics: {
          ...createTestCandidate().economics,
          inputs: {
            ...createTestCandidate().economics.inputs,
            productCost: { value: null, source: 'UNKNOWN' },
          },
        },
      });

      const nba = NextBestActionEngine.getNextBestAction(candidate);
      expect(nba?.priority).toBe(3);
      expect(nba?.category).toBe('CRITICAL_INPUT');
      expect(nba?.targetField).toBe('productCost');
    });
  });

  describe('P0-15 & 黄金验收用例: 玻璃水果盒 + 沥水篮一页决策结论包 (Golden Flow)', () => {
    it('完整闭环跑通玻璃水果盒+沥水篮，输出一页结论、双核心指标与敏感度分析', () => {
      // 1. 初始化 Candidate
      const candidate = createTestCandidate();
      const spec = candidate.specifications![0];

      // 2. 录入 3 家报价并选定 A 厂
      const quoteA: SupplierQuote = {
        id: 'quote-a',
        candidateId: candidate.id,
        specVersionId: spec.id,
        supplierName: 'A厂',
        status: 'ACTIVE',
        unitPrice: 42,
        packagingCost: { value: 3, source: 'FACT' },
        logoCost: { value: 1, source: 'FACT' },
        moq: 500,
        sampleCost: 100,
        toolingCost: 0,
        leadTimeDays: 25,
        captureMethod: 'MANUAL',
        sourceChannel: '1688',
        currency: 'CNY',
        capturedAt: new Date().toISOString(),
      };

      candidate.supplierQuotes = [quoteA];
      candidate.fxSnapshot = {
        currencyPair: 'CNY_USD',
        rate: 0.14,
        source: 'PBOC',
        capturedAt: new Date().toISOString(),
      };

      const primaryResult = SupplierQuoteService.selectPrimaryQuote(candidate, 'quote-a');
      const updatedCandidate = primaryResult.candidate;

      // 3. 计算经济模型与启动资金 (MOQ 500 * ¥46.00 + 样品 ¥100 + 首批头程 ¥6,429 = ¥29,529)
      updatedCandidate.economics = CandidateEconomicsService.calculateEconomics({
        sellingPrice: { value: 29.99, source: 'FACT' },
        productCost: { value: primaryResult.productCostUsd, source: 'FACT' }, // $6.44
        referralFeeRate: { value: 0.15, source: 'FACT' },
        fbaFeePerUnit: { value: 4.8, source: 'ESTIMATE' },
        freightPerUnit: { value: 1.8, source: 'ESTIMATE' },
        dutyPerUnit: { value: 0.4, source: 'ESTIMATE' },
        adsCostPerUnit: { value: 3.0, source: 'ESTIMATE' },
        returnRate: { value: 0.05, source: 'ASSUMPTION' },
        returnLossPerUnit: { value: 4.8, source: 'ESTIMATE' },
        storageFeePerUnit: { value: 0.17, source: 'ESTIMATE' },
      });

      updatedCandidate.initialCash = InitialCashService.calculateInitialCash({
        moq: 500,
        productCostPerUnit: 46.0,
        sampleCost: 100,
        firstFreightCost: 6429,
        currency: 'CNY',
      });

      // 4. 注入适用风险（食品安全与专利待排查）
      const { applicableRisks, assumptions } = RiskApplicabilityPolicy.determineApplicability(
        updatedCandidate.concept,
        updatedCandidate.category,
      );
      updatedCandidate.risks = applicableRisks;
      updatedCandidate.assumptions = assumptions;

      // 5. 门禁评估
      const decisionDetail = CandidateDecisionEngine.evaluate(updatedCandidate);
      updatedCandidate.decision = decisionDetail.verdict;
      updatedCandidate.decisionDetail = decisionDetail;

      // 验证未验证风险触发门禁拦截
      expect(updatedCandidate.decision).toBe('NEEDS_VALIDATION');

      // 6. 组装一页决策结论包
      const packet = DecisionPacketService.buildDecisionPacket(updatedCandidate);

      expect(packet.verdict).toBe('NEEDS_VALIDATION');
      expect(packet.verdictTitleZh).toBe('先补这份材料');
      expect(packet.adviceZh).toContain('食品接触');
      expect(packet.unitContributionProfitUsd).toBe(8.64);
      expect(packet.unitContributionMargin).toBe(0.2881);

      // P0-1 闭环断言: 首单启动资金齐备时，准确输出总需求 ¥2.95 万
      expect(packet.initialCashRequired.status).toBe('COMPLETE');
      expect(packet.initialCashRequired.amount).toBe(29529);
      expect(packet.initialCashRequired.formattedTextZh).toBe('¥2.95 万');
      expect(packet.confirmedChecklistZh).toContain('首单启动资金已测算完备 (¥2.95 万)');

      // 检查清单与下一步
      expect(packet.confirmedChecklistZh).toContain('市场容量与细分方向');
      expect(packet.confirmedChecklistZh).toContain('核心产品规格 (材质/容量/尺寸/售价)');
      expect(packet.confirmedChecklistZh).toContain('工厂正式报价 (已选定主选供应商)');
      expect(packet.confirmedChecklistZh).toContain('单件贡献利润与回本测算');
      expect(packet.missingChecklistZh.some((m) => m.includes('专利'))).toBe(true);

      // P0-2 闭环断言: 下一步严格推荐单一动作，先推食品接触材料报告，绝不合并专利排查
      expect(packet.nextBestAction?.targetField).toBe('FOOD_CONTACT');
      expect(packet.nextBestAction?.title).toBe('向工厂索取食品接触材料报告 (FDA/合规证明)');
      expect(packet.nextBestAction?.title).not.toContain('专利');

      // 边界确认 1: A 厂显式指定，严禁自动选择
      expect(updatedCandidate.primaryQuoteId).toBe('quote-a');
      expect(() => SupplierQuoteService.selectPrimaryQuote(candidate, 'non-existent')).toThrow();

      // 边界确认 2: fxSnapshot 结构完整
      expect(updatedCandidate.fxSnapshot).toBeDefined();
      expect(updatedCandidate.fxSnapshot?.currencyPair).toBe('CNY_USD');
      expect(updatedCandidate.fxSnapshot?.rate).toBe(0.14);
      expect(updatedCandidate.fxSnapshot?.source).toBe('PBOC');

      // 敏感度分析
      expect(packet.decisionSensitivities.length).toBeGreaterThan(0);
      expect(packet.decisionSensitivities.some((s) => s.factorName.includes('售价'))).toBe(true);

      // 折叠区数据完备
      expect(packet.conservativeScenarioSummary.unitContributionProfitUsd).toBeGreaterThan(0);
      expect(packet.costBreakdown.productCost).toBe(6.44);
    });
  });
});
