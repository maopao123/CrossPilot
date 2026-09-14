import { AutomationMode } from '@crosspilot/shared';
import {
  RpaAdapter,
  RpaExecutionInput,
  RpaExecutionResult,
} from './rpa.interface.js';

export interface YingdaoConfig {
  apiKey?: string;
  apiBaseUrl?: string;
  appId?: string;
}

export class YingdaoRpaAdapter implements RpaAdapter {
  readonly id = 'yingdao-rpa';
  readonly name = '影刀 (Yingdao) Enterprise RPA Adapter';
  readonly supportedModes: AutomationMode[] = ['LIVE'];

  constructor(private readonly config: YingdaoConfig = {}) {}

  async execute(input: RpaExecutionInput): Promise<RpaExecutionResult> {
    const apiKey = this.config.apiKey !== undefined ? this.config.apiKey : process.env.YINGDAO_API_KEY;

    // In LIVE mode, missing credentials must fail-closed. Never silently fall back to Mock!
    if (!apiKey) {
      return {
        jobId: '',
        status: 'FAILED',
        error: 'AUTH_REQUIRED: YINGDAO_API_KEY is not configured',
        durationMs: 0,
      };
    }

    const startTime = Date.now();

    // Real HTTP dispatch implementation
    try {
      const response = await fetch(`${this.config.apiBaseUrl || 'https://api.yingdao.com'}/v1/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          workflow: input.workflow,
          params: input.params,
        }),
      });

      if (!response.ok) {
        return {
          jobId: '',
          status: 'FAILED',
          error: `Yingdao HTTP ${response.status}: ${await response.text()}`,
          durationMs: Date.now() - startTime,
        };
      }

      const data = (await response.json()) as any;
      if (!data || typeof data !== 'object') {
        return {
          jobId: '',
          status: 'FAILED',
          error: 'INVALID_REMOTE_RESPONSE: response is not a valid JSON object',
          durationMs: Date.now() - startTime,
        };
      }

      // If response is empty or missing both jobId and status, it cannot serve as proof of execution
      if (!data.jobId && !data.status) {
        return {
          jobId: '',
          status: 'FAILED',
          error: 'INVALID_REMOTE_RESPONSE: response missing jobId and execution status',
          durationMs: Date.now() - startTime,
        };
      }

      // If job is accepted asynchronously (has jobId but no status, or explicitly RUNNING/SUBMITTED)
      if (data.status === 'RUNNING' || data.status === 'SUBMITTED' || (!data.status && data.jobId)) {
        return {
          jobId: data.jobId || '',
          status: 'RUNNING',
          output: data.output,
          durationMs: Date.now() - startTime,
        };
      }

      if (data.status === 'TIMEOUT') {
        return {
          jobId: data.jobId || '',
          status: 'TIMEOUT',
          error: data.error || 'Remote Yingdao job timed out',
          durationMs: Date.now() - startTime,
        };
      }

      if (data.status === 'FAILED') {
        return {
          jobId: data.jobId || '',
          status: 'FAILED',
          error: data.error || 'Remote Yingdao execution failed',
          durationMs: Date.now() - startTime,
        };
      }

      if (data.status === 'SUCCESS') {
        if (!data.jobId) {
          return {
            jobId: '',
            status: 'FAILED',
            error: 'INVALID_REMOTE_RESPONSE: response missing jobId for SUCCESS status',
            durationMs: Date.now() - startTime,
          };
        }
        return {
          jobId: data.jobId,
          status: 'SUCCESS',
          output: data.output,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        jobId: data.jobId || '',
        status: 'FAILED',
        error: `UNSUPPORTED_STATUS: Unknown remote status ${data.status}`,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        jobId: '',
        status: 'FAILED',
        error: err.message || 'Yingdao HTTP dispatch failed',
        durationMs: Date.now() - startTime,
      };
    }
  }
}
