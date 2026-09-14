import { PrismaClient, AutomationOperation } from '@prisma/client';
import { AutomationOperationStore } from '@crosspilot/db';
import { SimulatorERPAdapter } from '@crosspilot/integrations';

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

async function syncLocalPurchaseOrder(
  prisma: PrismaClient,
  workspaceId: string,
  externalId: string,
  parameters: any,
): Promise<void> {
  try {
    const existing = await prisma.purchaseOrder.findFirst({
      where: { workspaceId, poNumber: externalId },
    });
    if (existing) return;

    const supplierId = String(parameters.supplierId || '');
    const sup = await prisma.supplier.findFirst({ where: { workspaceId, id: supplierId } });
    if (!sup) return;

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
  } catch (err: any) {
    console.warn(`[AutomationRecovery] Failed to sync local PurchaseOrder for ${externalId}: ${err.message}`);
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
        const checkRes = await adapter.getPurchaseOrder({
          scope: { workspaceId: claimed.workspaceId, connectionId: claimed.connectionId },
          operationId: claimed.id,
        });

        if (checkRes.success && checkRes.data?.externalId) {
          const externalId = checkRes.data.externalId;
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
            const action = await prisma.plannedAction.findUnique({ where: { id: claimed.actionId } });
            const params = (action?.parameters as any) || {};
            await syncLocalPurchaseOrder(prisma, claimed.workspaceId, externalId, params);

            await prisma.plannedAction.updateMany({
              where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
              data: {
                status: 'SUCCESS',
                lastMessage: `ERP 采购单恢复成功 (远程已存在): ${externalId}`,
                parameters: {
                  ...params,
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
          continue;
        }

        // Distinguish definite NOT_FOUND from TIMEOUT / NETWORK_ERROR
        const isDefiniteNotFound = checkRes.errorCode === 'NOT_FOUND';

        if (isDefiniteNotFound) {
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
                  lastMessage: '重试超过上限，需要人工介入处理 (远端确认未创建)',
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
            await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, {
              mode: claimed.mode as any,
              provider: claimed.provider,
              operationId: claimed.id,
              phase: 'NEEDS_ATTENTION',
              effect: 'UNKNOWN',
              recovery: 'MANUAL',
              errorCode: 'QUERY_TIMEOUT_MAX',
            });

            if (claimed.actionId) {
              await prisma.plannedAction.updateMany({
                where: { id: claimed.actionId, workspaceId: claimed.workspaceId },
                data: {
                  status: 'FAILED',
                  lastMessage: '查询远端超时达上限，状态未知，需人工核实外部系统',
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

        if (claimed.actionId) {
          const action = await prisma.plannedAction.findUnique({
            where: { id: claimed.actionId },
          });

          if (action) {
            actionParams = (action.parameters as any) || {};
            const erpRes = await adapter.createPurchaseOrder({
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
          await syncLocalPurchaseOrder(prisma, claimed.workspaceId, externalId, actionParams);

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
          const nextCount = claimed.attemptCount + 1;
          if (nextCount >= 3) {
            await store.recordEvidence(claimed.workspaceId, claimed.id, claimed.version, {
              mode: claimed.mode as any,
              provider: claimed.provider,
              operationId: claimed.id,
              phase: 'NEEDS_ATTENTION',
              effect: 'NOT_APPLIED',
              recovery: 'MANUAL',
              errorCode: 'RETRY_FAILED_MAX',
            });
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
