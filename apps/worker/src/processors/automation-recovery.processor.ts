import { PrismaClient, AutomationOperation } from '@prisma/client';
import { AutomationOperationStore } from '@crosspilot/db';
import { SimulatorERPAdapter } from '@crosspilot/integrations';
import { ExecutionErrorClass, NormalizedExecutionError, normalizeExecutionError } from '@crosspilot/shared';

export const AUTOMATION_RECOVERY_QUEUE_NAME = 'crosspilot-automation-recovery';

export interface AutomationRecoveryOptions {
  workerId?: string;
  erpBaseUrl?: string;
  limit?: number;
}

export interface AutomationRecoveryResult {
  scanned: number;
  recovered: number;
  retried: number;
  escalated: number;
  failed: number;
}

export interface LocalSyncResult {
  success: boolean;
  error?: string;
}

async function syncLocalPurchaseOrder(
  prisma: PrismaClient,
  workspaceId: string,
  externalId: string,
  parameters: any,
): Promise<LocalSyncResult> {
  try {
    const existing = await prisma.purchaseOrder.findFirst({
      where: { workspaceId, poNumber: externalId },
    });
    if (existing) return { success: true };

    const supplierId = String(parameters.supplierId || '');
    const sup = await prisma.supplier.findFirst({ where: { workspaceId, id: supplierId } });
    if (!sup) {
      const err = `SUPPLIER_NOT_FOUND: supplierId '${supplierId}' not found in workspace '${workspaceId}'`;
      console.warn(`[AutomationRecovery] Failed to sync local PurchaseOrder for ${externalId}: ${err}`);
      return { success: false, error: err };
    }

    const lines = (parameters.lines as any[]) || [];
    const totalAmount = lines.reduce((sum, l) => sum + ((l.quantity || 0) * (l.unitCostMinor || 0)) / 100, 0);

    const validItemCreates = [];
    for (const l of lines) {
      const skuInDb = await prisma.sku.findFirst({
        where: { workspaceId, id: l.skuId },
      });
      if (skuInDb) {
        validItemCreates.push({
          workspaceId,
          skuId: l.skuId,
          quantity: l.quantity,
          unitCost: (l.unitCostMinor || 0) / 100,
          receivedQuantity: 0,
        });
      }
    }

    await prisma.purchaseOrder.create({
      data: {
        workspaceId,
        supplierId: sup.id,
        poNumber: externalId,
        status: 'CONFIRMED',
        totalAmount,
        ...(validItemCreates.length > 0 ? { items: { create: validItemCreates } } : {}),
      },
    });
    return { success: true };
  } catch (err: any) {
    console.warn(`[AutomationRecovery] Failed to sync local PurchaseOrder for ${externalId}: ${err.message}`);
    return { success: false, error: err.message || 'UNKNOWN_LOCAL_SYNC_ERROR' };
  }
}

export async function processAutomationRecovery(
  prisma: PrismaClient,
  options: AutomationRecoveryOptions = {},
): Promise<AutomationRecoveryResult> {
  const store = new AutomationOperationStore(prisma);
  const workerId = options.workerId || `recovery-worker-${Date.now()}`;
  const erpBaseUrl = options.erpBaseUrl || process.env.SIMULATOR_ERP_URL || 'http://127.0.0.1:9099';
  const adapter = new SimulatorERPAdapter({ baseUrl: erpBaseUrl });

  const dueOps = await store.listDue(new Date(), options.limit || 20);

  let recovered = 0;
  let retried = 0;
  let escalated = 0;
  let failed = 0;

  for (const op of dueOps) {
    let claimed: AutomationOperation;
    try {
      // Claim lease for 30,000 ms (30 seconds) preserving existing phase
      claimed = await store.claim(op.workspaceId, op.id, op.version, workerId, 30000);
    } catch {
      continue;
    }

    try {
      // Case 1: In SUBMITTED / VERIFYING or recovery=QUERY -> Check remote reality
      if (claimed.phase === 'SUBMITTED' || claimed.phase === 'VERIFYING' || claimed.recovery === 'QUERY') {
        let action: any = null;
        let params: any = {};
        if (claimed.actionId) {
          action = await prisma.plannedAction.findUnique({ where: { id: claimed.actionId } });
          params = (action?.parameters as any) || {};
        }

        const checkRes = await adapter.getPurchaseOrder({
          scope: { workspaceId: claimed.workspaceId, connectionId: claimed.connectionId },
          operationId: claimed.id,
        });

        if (checkRes.success && checkRes.data?.externalId) {
          const externalId = checkRes.data.externalId;
          const remoteOrder = checkRes.data;

          // D-R1: 远端单据关键内容与本地原始请求 payload 比对
          // 至少供应商标识严格相等、总金额严格相等（如有明细则明细数量也比对）
          const localSupplierId = String(params.supplierId || '');
          const remoteSupplierId = String(remoteOrder.supplierId || '');

          const localLines = Array.isArray(params.lines) ? params.lines : [];
          const localTotalAmountMinor = localLines.reduce(
            (sum: number, l: any) => sum + (Number(l.quantity) || 0) * (Number(l.unitCostMinor) || 0),
            0,
          );
          const remoteTotalAmountMinor =
            remoteOrder.totalAmountMinor != null
              ? Number(remoteOrder.totalAmountMinor)
              : (Array.isArray(remoteOrder.lines)
                  ? remoteOrder.lines.reduce(
                      (sum: number, l: any) =>
                        sum + (Number(l.quantity) || 0) * (Number(l.unitCostMinor) || 0),
                      0,
                    )
                  : null);

          const localTotalQty = localLines.reduce(
            (sum: number, l: any) => sum + (Number(l.quantity) || 0),
            0,
          );
          const remoteTotalQty = Array.isArray(remoteOrder.lines)
            ? remoteOrder.lines.reduce(
                (sum: number, l: any) => sum + (Number(l.quantity) || 0),
                0,
              )
            : null;

          const supplierMismatch = Boolean(
            localSupplierId && remoteSupplierId && localSupplierId !== remoteSupplierId,
          );
          const amountMismatch = Boolean(
            localLines.length > 0 &&
              remoteTotalAmountMinor != null &&
              localTotalAmountMinor !== remoteTotalAmountMinor,
          );
          const quantityMismatch = Boolean(
            localLines.length > 0 &&
              remoteTotalQty != null &&
              localTotalQty !== remoteTotalQty,
          );

          if (supplierMismatch || amountMismatch || quantityMismatch) {
            const conflictDetails = {
              reason: 'REMOTE_PAYLOAD_MISMATCH',
              mismatches: [
                ...(supplierMismatch
                  ? [`supplierId: local='${localSupplierId}' vs remote='${remoteSupplierId}'`]
                  : []),
                ...(amountMismatch
                  ? [`totalAmountMinor: local=${localTotalAmountMinor} vs remote=${remoteTotalAmountMinor}`]
                  : []),
                ...(quantityMismatch
                  ? [`totalQuantity: local=${localTotalQty} vs remote=${remoteTotalQty}`]
                  : []),
              ],
              local: {
                supplierId: localSupplierId,
                totalAmountMinor: localTotalAmountMinor,
                totalQuantity: localTotalQty,
              },
              remote: {
                externalId,
                supplierId: remoteSupplierId,
                totalAmountMinor: remoteTotalAmountMinor,
                totalQuantity: remoteTotalQty,
              },
            };

            const evidenceData: any = {
              mode: claimed.mode as any,
              provider: claimed.provider,
              operationId: claimed.id,
              phase: 'NEEDS_ATTENTION',
              effect: 'NOT_APPLIED',
              recovery: 'MANUAL',
              externalId,
              errorCode: 'REMOTE_PAYLOAD_MISMATCH',
              errorClass: 'VERIFY_MISMATCH' as ExecutionErrorClass,
              normalizedError: normalizeExecutionError(
                new Error(`Remote payload mismatch: ${conflictDetails.mismatches.join('; ')}`),
                {
                  provider: claimed.provider,
                  code: 'REMOTE_PAYLOAD_MISMATCH',
                  defaultClass: 'VERIFY_MISMATCH',
                },
              ),
              conflictDetails,
            };

            await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, evidenceData);

            if (claimed.actionId) {
              await prisma.plannedAction.updateMany({
                where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
                data: {
                  status: 'FAILED',
                  lastMessage: `ERP 采购单反查内容与原始请求不符 (${conflictDetails.mismatches.join('; ')})，已置入 NEEDS_ATTENTION 待人工核对`,
                  parameters: {
                    ...params,
                    _evidence: evidenceData,
                  },
                },
              });
            }
            escalated++;
            continue;
          }

          // 内容校验一致，执行本地 PurchaseOrder 同步
          const syncRes = await syncLocalPurchaseOrder(prisma, claimed.workspaceId, externalId, params);
          if (!syncRes.success) {
            // 远端已收敛生效但本地同步失败：落证据并进入 NEEDS_ATTENTION / MANUAL 可追踪状态，严禁静默吞掉
            const evidenceData: any = {
              mode: claimed.mode as any,
              provider: claimed.provider,
              operationId: claimed.id,
              phase: 'NEEDS_ATTENTION',
              effect: 'APPLIED',
              recovery: 'MANUAL',
              externalId,
              errorCode: 'LOCAL_SYNC_FAILED',
              errorClass: 'PROVIDER_ERROR' as ExecutionErrorClass,
              normalizedError: normalizeExecutionError(
                new Error(`Failed to sync local PurchaseOrder: ${syncRes.error}`),
                {
                  provider: claimed.provider,
                  code: 'LOCAL_SYNC_FAILED',
                  defaultClass: 'PROVIDER_ERROR',
                },
              ),
              verifiedAt: new Date().toISOString(),
              syncError: syncRes.error,
            };

            await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, evidenceData);

            if (claimed.actionId) {
              await prisma.plannedAction.updateMany({
                where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
                data: {
                  status: 'FAILED',
                  lastMessage: `ERP 采购单远端已生效 (${externalId})，但本地单据同步失败: ${syncRes.error}，需人工核对同步`,
                  parameters: {
                    ...params,
                    _evidence: evidenceData,
                  },
                },
              });
            }
            escalated++;
            continue;
          }

          // 校验与本地同步均成功，收敛至 COMPLETED / APPLIED
          const evidenceData: any = {
            mode: claimed.mode as any,
            provider: claimed.provider,
            operationId: claimed.id,
            phase: 'COMPLETED',
            effect: 'APPLIED',
            recovery: 'NONE',
            externalId,
            verifiedAt: new Date().toISOString(),
          };

          await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, evidenceData);

          if (claimed.actionId) {
            await prisma.plannedAction.updateMany({
              where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
              data: {
                status: 'SUCCESS',
                lastMessage: `ERP 采购单恢复成功 (远程已存在): ${externalId}`,
                parameters: {
                  ...params,
                  _evidence: evidenceData,
                },
              },
            });
          }
          recovered++;
          continue;
        }

        // Distinguish definite NOT_FOUND from TIMEOUT / NETWORK_ERROR / AUTH / PERMISSION
        const checkNormalized: NormalizedExecutionError =
          checkRes.normalizedError ||
          normalizeExecutionError(checkRes.errorMessage || checkRes, {
            provider: claimed.provider,
            code: checkRes.errorCode,
            originalStatus: checkRes.statusCode,
          });

        // Query failure: AUTH / PERMISSION errors cannot be resolved by retrying query
        if (checkNormalized.class === 'AUTH' || checkNormalized.class === 'PERMISSION') {
          const recoveryAction = checkNormalized.class === 'AUTH' ? 'REAUTHORIZE' : 'MANUAL';
          const evidenceData: any = {
            mode: claimed.mode as any,
            provider: claimed.provider,
            operationId: claimed.id,
            phase: 'NEEDS_ATTENTION',
            effect: 'UNKNOWN',
            recovery: recoveryAction,
            errorCode: checkNormalized.code,
            errorClass: checkNormalized.class,
            normalizedError: checkNormalized,
          };

          await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, evidenceData);

          if (claimed.actionId) {
            await prisma.plannedAction.updateMany({
              where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
              data: {
                status: 'FAILED',
                lastMessage: `ERP 远端查询鉴权/权限失败 (${checkNormalized.class}: ${checkNormalized.message})，需人工/重新授权处理`,
                parameters: {
                  ...params,
                  _evidence: evidenceData,
                },
              },
            });
          }
          escalated++;
          continue;
        }

        const isDefiniteNotFound = checkNormalized.class === 'NOT_FOUND';

        if (isDefiniteNotFound) {
          if (claimed.attemptCount >= 3) {
            const evidenceData: any = {
              mode: claimed.mode as any,
              provider: claimed.provider,
              operationId: claimed.id,
              phase: 'NEEDS_ATTENTION',
              effect: 'NOT_APPLIED',
              recovery: 'MANUAL',
              errorCode: 'MAX_RETRIES_EXCEEDED',
              errorClass: checkNormalized.class,
              normalizedError: checkNormalized,
            };
            await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, evidenceData);

            if (claimed.actionId) {
              await prisma.plannedAction.updateMany({
                where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
                data: {
                  status: 'FAILED',
                  lastMessage: '重试超过上限，需要人工介入处理 (远端确认未创建)',
                  parameters: {
                    ...params,
                    _evidence: evidenceData,
                  },
                },
              });
            }
            escalated++;
            continue;
          }

          // Transition to READY for retry
          await prisma.automationOperation.update({
            where: { id: claimed.id },
            data: {
              version: { increment: 1 },
              phase: 'READY',
              recovery: 'RETRY',
              effect: 'NOT_APPLIED',
              nextAttemptAt: new Date(Date.now() + Math.pow(2, claimed.attemptCount) * 1000),
              leaseOwner: null,
              leaseUntil: null,
            },
          });
          retried++;
          continue;
        } else {
          // Timeout or network error during query: remote status remains UNKNOWN
          if (claimed.attemptCount >= 3) {
            const evidenceData: any = {
              mode: claimed.mode as any,
              provider: claimed.provider,
              operationId: claimed.id,
              phase: 'NEEDS_ATTENTION',
              effect: 'UNKNOWN',
              recovery: 'MANUAL',
              errorCode: 'QUERY_TIMEOUT_MAX',
              errorClass: checkNormalized.class,
              normalizedError: checkNormalized,
            };
            await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, evidenceData);

            if (claimed.actionId) {
              await prisma.plannedAction.updateMany({
                where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
                data: {
                  status: 'FAILED',
                  lastMessage: '查询远端超时达上限，状态未知，需人工核实外部系统',
                  parameters: {
                    ...params,
                    _evidence: evidenceData,
                  },
                },
              });
            }
            escalated++;
            continue;
          }

          await prisma.automationOperation.update({
            where: { id: claimed.id },
            data: {
              version: { increment: 1 },
              phase: 'SUBMITTED',
              recovery: 'QUERY',
              effect: 'UNKNOWN',
              nextAttemptAt: new Date(Date.now() + Math.pow(2, claimed.attemptCount) * 1000),
              leaseOwner: null,
              leaseUntil: null,
            },
          });
          retried++;
          continue;
        }
      }

      // Case 2: In READY / recovery=RETRY -> Execute retry
      if (claimed.phase === 'READY' || claimed.recovery === 'RETRY') {
        if (claimed.attemptCount >= 3) {
          await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, {
            mode: claimed.mode as any,
            provider: claimed.provider,
            operationId: claimed.id,
            phase: 'NEEDS_ATTENTION',
            effect: 'NOT_APPLIED',
            recovery: 'MANUAL',
            errorCode: 'MAX_RETRIES_EXCEEDED',
          });

          if (claimed.actionId) {
            await prisma.plannedAction.updateMany({
              where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
              data: {
                status: 'FAILED',
                lastMessage: '重试超过上限，需要人工介入处理',
              },
            });
          }
          escalated++;
          continue;
        }

        let createSuccess = false;
        let externalId: string | undefined;
        let actionParams: any = {};
        let erpRes: any = null;

        if (claimed.actionId) {
          const action = await prisma.plannedAction.findUnique({
            where: { id: claimed.actionId },
          });

          if (action) {
            actionParams = (action.parameters as any) || {};
            erpRes = await adapter.createPurchaseOrder({
              scope: { workspaceId: claimed.workspaceId, connectionId: claimed.connectionId },
              operationId: claimed.id,
              idempotencyKey: claimed.idempotencyKey,
              supplierId: String(actionParams.supplierId || 'DEFAULT'),
              lines: actionParams.lines || [],
            });

            if (erpRes.success && erpRes.data?.externalId) {
              createSuccess = true;
              externalId = erpRes.data.externalId;
            }
          }
        }

        if (createSuccess && externalId) {
          const syncRes = await syncLocalPurchaseOrder(prisma, claimed.workspaceId, externalId, actionParams);
          if (!syncRes.success) {
            const evidenceData: any = {
              mode: claimed.mode as any,
              provider: claimed.provider,
              operationId: claimed.id,
              phase: 'NEEDS_ATTENTION',
              effect: 'APPLIED',
              recovery: 'MANUAL',
              externalId,
              errorCode: 'LOCAL_SYNC_FAILED',
              errorClass: 'PROVIDER_ERROR' as ExecutionErrorClass,
              normalizedError: normalizeExecutionError(
                new Error(`Failed to sync local PurchaseOrder: ${syncRes.error}`),
                {
                  provider: claimed.provider,
                  code: 'LOCAL_SYNC_FAILED',
                  defaultClass: 'PROVIDER_ERROR',
                },
              ),
              verifiedAt: new Date().toISOString(),
              syncError: syncRes.error,
            };

            await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, evidenceData);

            if (claimed.actionId) {
              await prisma.plannedAction.updateMany({
                where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
                data: {
                  status: 'FAILED',
                  lastMessage: `ERP 采购单重试远端已成功 (${externalId})，但本地单据同步失败: ${syncRes.error}，需人工核对同步`,
                  parameters: {
                    ...actionParams,
                    _evidence: evidenceData,
                  },
                },
              });
            }
            escalated++;
            continue;
          }

          await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, {
            mode: claimed.mode as any,
            provider: claimed.provider,
            operationId: claimed.id,
            phase: 'COMPLETED',
            effect: 'APPLIED',
            recovery: 'NONE',
            externalId,
            verifiedAt: new Date().toISOString(),
          });

          if (claimed.actionId) {
            await prisma.plannedAction.updateMany({
              where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
              data: {
                status: 'SUCCESS',
                lastMessage: `ERP 采购单重试成功: ${externalId}`,
                parameters: {
                  ...actionParams,
                  _evidence: {
                    mode: claimed.mode,
                    provider: claimed.provider,
                    operationId: claimed.id,
                    phase: 'COMPLETED',
                    effect: 'APPLIED',
                    recovery: 'NONE',
                    externalId,
                    verifiedAt: new Date().toISOString(),
                  },
                },
              },
            });
          }
          recovered++;
        } else {
          const erpNormalized: NormalizedExecutionError =
            erpRes?.normalizedError ||
            normalizeExecutionError(erpRes?.error || erpRes || new Error('Create purchase order failed'), {
              provider: claimed.provider,
              code: erpRes?.errorCode,
              originalStatus: erpRes?.statusCode,
            });

          const nextCount = claimed.attemptCount + 1;

          // Non-retryable error (AUTH, PERMISSION, VALIDATION, CONFLICT):
          // Do not blind loop. Immediately escalate to NEEDS_ATTENTION.
          if (!erpNormalized.retryable && erpNormalized.class !== 'TIMEOUT') {
            const recoveryAction = erpNormalized.class === 'AUTH' ? 'REAUTHORIZE' : 'MANUAL';
            const evidenceData: any = {
              mode: claimed.mode as any,
              provider: claimed.provider,
              operationId: claimed.id,
              phase: 'NEEDS_ATTENTION',
              effect: 'NOT_APPLIED',
              recovery: recoveryAction,
              errorCode: erpNormalized.code,
              errorClass: erpNormalized.class,
              normalizedError: erpNormalized,
            };

            await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, evidenceData);

            if (claimed.actionId) {
              await prisma.plannedAction.updateMany({
                where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
                data: {
                  status: 'FAILED',
                  lastMessage: `ERP 采购单重试遇到不可重试错误 (${erpNormalized.class}: ${erpNormalized.message})，已置入 NEEDS_ATTENTION`,
                  parameters: {
                    ...actionParams,
                    _evidence: evidenceData,
                  },
                },
              });
            }
            escalated++;
            continue;
          }

          // TIMEOUT error during retry:
          // In-flight status unknown! Do NOT blindly retry creation; switch to QUERY to verify remote state.
          if (erpNormalized.class === 'TIMEOUT') {
            if (nextCount >= 3) {
              const evidenceData: any = {
                mode: claimed.mode as any,
                provider: claimed.provider,
                operationId: claimed.id,
                phase: 'NEEDS_ATTENTION',
                effect: 'UNKNOWN',
                recovery: 'MANUAL',
                errorCode: 'RETRY_TIMEOUT_MAX',
                errorClass: erpNormalized.class,
                normalizedError: erpNormalized,
              };
              await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, evidenceData);

              if (claimed.actionId) {
                await prisma.plannedAction.updateMany({
                  where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
                  data: {
                    status: 'FAILED',
                    lastMessage: 'ERP 采购单重试超时达上限，状态未知，需人工核对外部系统',
                    parameters: {
                      ...actionParams,
                      _evidence: evidenceData,
                    },
                  },
                });
              }
              escalated++;
              continue;
            }

            await prisma.automationOperation.update({
              where: { id: claimed.id },
              data: {
                version: { increment: 1 },
                phase: 'SUBMITTED',
                recovery: 'QUERY',
                effect: 'UNKNOWN',
                attemptCount: nextCount,
                nextAttemptAt: new Date(Date.now() + Math.pow(2, nextCount) * 1000),
                leaseOwner: null,
                leaseUntil: null,
              },
            });
            retried++;
            continue;
          }

          // Retryable error (TRANSIENT, RATE_LIMIT, etc.)
          if (nextCount >= 3) {
            const evidenceData: any = {
              mode: claimed.mode as any,
              provider: claimed.provider,
              operationId: claimed.id,
              phase: 'NEEDS_ATTENTION',
              effect: 'NOT_APPLIED',
              recovery: 'MANUAL',
              errorCode: 'RETRY_FAILED_MAX',
              errorClass: erpNormalized.class,
              normalizedError: erpNormalized,
            };
            await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, evidenceData);

            if (claimed.actionId) {
              await prisma.plannedAction.updateMany({
                where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
                data: {
                  status: 'FAILED',
                  lastMessage: `ERP 采购单重试达到上限 (${erpNormalized.message})，需要人工介入处理`,
                  parameters: {
                    ...actionParams,
                    _evidence: evidenceData,
                  },
                },
              });
            }
            escalated++;
          } else {
            await prisma.automationOperation.update({
              where: { id: claimed.id },
              data: {
                version: { increment: 1 },
                phase: 'READY',
                recovery: 'RETRY',
                attemptCount: nextCount,
                nextAttemptAt: new Date(Date.now() + Math.pow(2, nextCount) * 1000),
                leaseOwner: null,
                leaseUntil: null,
              },
            });
            retried++;
          }
        }
      }
    } catch (err: any) {
      console.error(`[AutomationRecovery] Recovery processing failed for op ${op.id}: ${err.message}`);
      failed++;
    }
  }

  return {
    scanned: dueOps.length,
    recovered,
    retried,
    escalated,
    failed,
  };
}
