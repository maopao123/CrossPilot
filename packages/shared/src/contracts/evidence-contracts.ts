/**
 * 证据取值真实状态（Value Status）：客观描述数值本身的获取形态
 * 映射说明：仅在新增的 EvidenceMeta 中采用 valueStatus，不与既有 ResearchEvidence.status 产生破坏性冲突
 */
export type EvidenceValueStatus =
  | 'KNOWN'       // 真实存在且直接从可信源获取的客观事实（含合法零值）
  | 'DERIVED'     // 基于已知客观事实经过确定性公式推导得出的数值
  | 'ESTIMATED'   // 缺乏直接事实、基于经验给出的估算值（需明确标明）
  | 'MISSING'     // 上游缺失、无法采集或数据源未提供（值为 null）
  | 'CONFLICTING';// 多个独立数据源提供的数值存在冲突

/**
 * 证据时效状态（Freshness）：客观描述数据的时间衰减状态
 */
export type EvidenceFreshness =
  | 'FRESH'       // 处于业务允许的时效窗口内
  | 'AGING'       // 接近时效阈值边界，准确度正在衰减
  | 'STALE'       // 已超出有效时间窗口（陈旧数据）
  | 'UNKNOWN';    // 缺乏时间戳，时效状态未知

export interface EvidenceMeta {
  evidenceId: string;
  sourceType: 'API' | 'FILE' | 'WEB' | 'USER' | 'SIMULATOR' | 'DERIVED';
  sourceRef?: string;
  observedAt?: string | null;     // 允许为 null，上游无时间戳时严禁填 now()
  capturedAt?: string;            // 本系统采集时间戳 (可选)
  valueStatus: EvidenceValueStatus;// 统一使用 valueStatus
  freshness: EvidenceFreshness;   // FRESH | AGING | STALE | UNKNOWN
  proxyUsed?: boolean;
  missingReason?: string;
  confidence?: number;
}
