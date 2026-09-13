import { PrismaClient } from '@prisma/client';
import { OutcomeEvaluator, resolveWorkspaceToday } from '@crosspilot/db';

/**
 * One outcome-evaluation sweep (PRD §2.6)：
 * 逐 workspace 扫描 status='OBSERVING' AND observe_end <= today（today = sim_date 优先），
 * 逐条调用 domain 评估引擎落终态。单 workspace / 单 outcome 失败只打 warn，
 * 绝不阻塞其他 workspace；终态不可逆，已评估记录自动跳过。
 */
export async function runOutcomeEvaluation(prisma: PrismaClient): Promise<void> {
  let workspaces: { workspaceId: string }[];
  try {
    workspaces = await prisma.actionOutcome.findMany({
      where: { status: 'OBSERVING' },
      select: { workspaceId: true },
      distinct: ['workspaceId'],
    });
  } catch (err: any) {
    console.warn('⚠️ Outcome evaluator skipped: cannot query action_outcomes:', err?.message || err);
    return;
  }

  const evaluator = new OutcomeEvaluator(prisma);
  for (const { workspaceId } of workspaces) {
    try {
      const today = await resolveWorkspaceToday(prisma, workspaceId);
      const due = await prisma.actionOutcome.findMany({
        where: {
          workspaceId,
          status: 'OBSERVING',
          observeEnd: { lte: today },
        },
        select: { id: true },
      });
      for (const row of due) {
        try {
          const result = await evaluator.evaluateAndPersist(row.id);
          if (result.evaluated) {
            console.log(
              `📊 Outcome ${row.id} evaluated → ${result.result?.status}` +
                (result.result?.evaluationReason ? `（${result.result.evaluationReason}）` : ''),
            );
          }
        } catch (err: any) {
          console.warn(`⚠️ Outcome evaluation failed for ${row.id}:`, err?.message || err);
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ Outcome evaluation sweep failed for workspace ${workspaceId}:`, err?.message || err);
    }
  }
}
