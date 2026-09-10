export interface AgentTaskJobData {
  taskId: string;
  workspaceId: string;
  taskType: string;
  payload: Record<string, unknown>;
}

export interface AgentTaskJobResult {
  taskId: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

export async function processAgentTaskJob(
  jobData: AgentTaskJobData,
): Promise<AgentTaskJobResult> {
  console.log(`[Worker] Processing task ${jobData.taskId} (type: ${jobData.taskType}) for workspace ${jobData.workspaceId}`);

  // Base worker scaffold execution for Milestone 0
  return {
    taskId: jobData.taskId,
    success: true,
    result: {
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      taskType: jobData.taskType,
    },
  };
}
