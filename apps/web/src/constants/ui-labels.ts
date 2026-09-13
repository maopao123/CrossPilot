/**
 * CrossPilot 前端统一中文词典与状态映射 (UI Labels & Status Map)
 * 
 * 规范准则：
 * 1. 业务与界面状态统一使用简体中文映射显示；
 * 2. 严禁改动后端 API / Prisma Enum 值；
 * 3. 行业通用词（SKU/ASIN/PPC/ACOS/Listing 等）与技术词（Agent/Workflow/Tool/Trace 等）保留英文。
 */

// 统一状态显示映射字典
export const STATUS_LABELS: Record<string, string> = {
  // Workflow / Agent / Task 运行状态
  PENDING: '待处理',
  RUNNING: '运行中',
  WAITING: '等待中',
  WAITING_APPROVAL: '等待审批',
  GENERATED: '已生成',
  CREATED: '已创建',
  APPROVED: '已确认',
  EXECUTING: '执行中',
  EXECUTED: '已记账',
  VERIFIED: '已核验',
  SUCCEEDED: '已完成',
  COMPLETED: '已完成',
  SUCCESS: '成功',
  FAILED: '失败',
  CANCELLED: '已取消',

  // 供应链 / PO 履约状态
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  PRODUCTION: '生产中',
  INSPECTION: '验货中',
  SHIPPED: '已发货',
  RECEIVED: '已收货',
  DELIVERED: '已送达',
  REFUNDED: '已退款',

  // 产品 / 库存 / 风险状态
  ACTIVE: '正常',
  INACTIVE: '已停用',
  ARCHIVED: '已归档',
  HEALTHY: '健康',
  WARNING: '预警',
  CRITICAL: '严重',
  LOW: '低风险',
  MEDIUM: '中风险',
  HIGH: '高风险',

  // 合规检查状态
  PASS: '通过',
  WARN: '警告',
  BLOCKED: '已拦截',

  // 视觉事实状态
  EXTRACTED: '已提取',
  REJECTED: '已驳回',

  // 广告活动状态
  PAUSED: '已暂停',
  ENABLED: '投放中',
  ARCHIVED_CAMP: '已归档',

  // V10 Epic A — Outcome Tracking 状态（执行结果徽标）
  OBSERVING: '观察中',
  POSITIVE: '正向结果',
  NEGATIVE: '负向结果',
  NEUTRAL: '无显著变化',
  INCONCLUSIVE: '数据不足',
  EXPIRED: '已过期',

  // Listing 生成引擎降级状态
  TEMPLATE_FALLBACK: '模板降级',
  LEGACY_TEMPLATE: '传统模板',
};

/**
 * 安全获取状态的中文显示文案，未命中时回退显示原枚举字符串
 */
export function getStatusLabel(status: string | undefined | null): string {
  if (!status) return '-';
  const upper = status.toUpperCase();
  return STATUS_LABELS[upper] || status;
}

// 严重等级与优先级映射
export const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: '严重',
  WARNING: '警告',
  INFO: '提示',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
};

export function getSeverityLabel(severity: string | undefined | null): string {
  if (!severity) return '-';
  return SEVERITY_LABELS[severity.toUpperCase()] || severity;
}

// 工作流节点执行运行时
export const RUNTIME_LABELS: Record<string, string> = {
  AI: 'AI 节点',
  TOOL: 'Tool 工具',
  HUMAN: '人工把关',
  RPA: 'RPA 自动化',
};

// VOC 情感与主题类型映射
export const VOC_LABELS: Record<string, string> = {
  PAIN_POINT: '买家痛点',
  PRAISE: '好评卖点',
  FEATURE: '功能特性',
  DELIGHT: '爽点期望',
  NEGATIVE: '负向反馈',
  POSITIVE: '正向好评',
  NEUTRAL: '中性评价',
};

export function getVocLabel(key: string | undefined | null): string {
  if (!key) return '-';
  return VOC_LABELS[key.toUpperCase()] || key;
}

// 常用按钮与通用操作文案
export const COMMON_LABELS = {
  // 操作按钮
  create: '新建',
  add: '添加',
  edit: '编辑',
  delete: '删除',
  save: '保存',
  cancel: '取消',
  confirm: '确认',
  submit: '提交',
  run: '运行',
  execute: '执行',
  retry: '重试',
  approve: '通过',
  reject: '驳回',
  upload: '上传',
  download: '下载',
  import: '导入',
  export: '导出',
  search: '搜索',
  filter: '筛选',
  reset: '重置',
  refresh: '刷新',
  view: '查看',
  viewDetails: '查看详情',
  details: '详情',
  previous: '上一步',
  next: '下一步',
  back: '返回',
  close: '关闭',
  continue: '继续',
  generate: '生成',
  regenerate: '重新生成',
  analyze: '分析',
  startAnalysis: '开始分析',
  apply: '应用',
  clear: '清空',
  copy: '复制',
  copied: '已复制',

  // 加载与空状态
  loading: '加载中...',
  processing: '处理中...',
  generating: '正在生成...',
  analyzing: '正在分析...',
  saving: '正在保存...',
  noResults: '暂无结果',
  noData: '暂无数据',
  savedSuccessfully: '保存成功',
  generatedSuccessfully: '生成成功',
  deletedSuccessfully: '删除成功',

  // 错误提示
  loadFailed: '数据加载失败',
  requestTimeout: '请求超时，请稍后重试',
  uploadFailed: '上传失败',
  executionFailed: '执行失败',
  permissionDenied: '当前账号没有权限执行此操作',
};
