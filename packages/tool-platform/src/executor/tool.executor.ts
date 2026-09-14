import {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolError,
  ToolErrorEnvelope,
  ToolInputSchema,
} from '../contracts/tool.types.js';
import { ToolRegistry } from '../registry/tool.registry.js';

export interface ExecuteOptions {
  timeoutMs?: number;
  skipValidation?: boolean;
}

export class ToolExecutor {
  constructor(private readonly registry: ToolRegistry) {}

  async execute<TInput = any, TOutput = any>(
    toolId: string,
    input: TInput,
    context: Partial<ToolExecutionContext> & { workspaceId: string },
    options: ExecuteOptions = {},
  ): Promise<ToolExecutionResult<TOutput>> {
    const startTime = Date.now();
    const traceId =
      context.traceId || `trace_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const fullContext: ToolExecutionContext = {
      workspaceId: context.workspaceId,
      userId: context.userId,
      traceId,
      source: context.source || 'TOOL_CENTER',
      taskId: context.taskId,
      stepNumber: context.stepNumber,
      metadata: context.metadata,
    };

    const tool = this.registry.get(toolId);
    if (!tool) {
      const error: ToolError = {
        code: 'TOOL_NOT_FOUND',
        message: `Tool '${toolId}' is not registered in ToolPlatform.`,
        retryable: false,
      };
      return {
        success: false,
        error,
        errorEnvelope: {
          code: error.code,
          category: 'UNSUPPORTED',
          message: error.message,
          retryable: false,
        },
        traceId,
        durationMs: Date.now() - startTime,
      };
    }

    // 1. Permission Verification
    if (tool.permissions && tool.permissions.length > 0) {
      const userPermissions = (fullContext.metadata?.permissions as string[]) || [];
      const userRole = fullContext.metadata?.role as string;
      const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';
      const hasPermission = isPrivileged || tool.permissions.some((p) => userPermissions.includes(p));
      if (!hasPermission && fullContext.source !== 'WORKFLOW') {
        const error: ToolError = {
          code: 'PERMISSION_DENIED',
          message: `Execution of tool '${toolId}' requires permissions: ${tool.permissions.join(', ')}`,
          retryable: false,
        };
        return {
          success: false,
          error,
          errorEnvelope: {
            code: error.code,
            category: 'AUTH',
            message: error.message,
            retryable: false,
          },
          traceId,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 2. Schema Validation
    if (!options.skipValidation && tool.inputSchema) {
      const validationError = this.validateInput(input, tool.inputSchema);
      if (validationError) {
        const error: ToolError = {
          code: 'VALIDATION_ERROR',
          message: validationError,
          retryable: false,
        };
        return {
          success: false,
          error,
          errorEnvelope: {
            code: error.code,
            category: 'VALIDATION',
            message: error.message,
            retryable: false,
          },
          traceId,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 3. Execution with optional Timeout
    const timeoutLimit = options.timeoutMs || tool.timeoutMs || 30000;
    let timerId: any = null;

    try {
      const executePromise = Promise.resolve(tool.execute(input, fullContext));
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(
          () => reject(new Error(`Tool execution timed out after ${timeoutLimit}ms`)),
          timeoutLimit,
        );
      });

      const result = await Promise.race([executePromise, timeoutPromise]);
      if (timerId) clearTimeout(timerId);
      const durationMs = Date.now() - startTime;

      const evidenceMeta = (result as any)?.evidenceMeta;
      const errorEnvelope = (result as any)?.errorEnvelope;

      return {
        success: true,
        data: result as TOutput,
        traceId,
        durationMs,
        cost: tool.costEstimate,
        ...(Array.isArray(evidenceMeta) ? { evidenceMeta } : {}),
        ...(errorEnvelope ? { errorEnvelope } : {}),
      };
    } catch (err: any) {
      if (timerId) clearTimeout(timerId);
      const durationMs = Date.now() - startTime;
      const isTimeout = err.message?.includes('timed out');

      const toolError: ToolError = {
        code: isTimeout ? 'TIMEOUT' : (err.code || 'EXECUTION_ERROR'),
        message: err.message || 'Unknown error occurred during tool execution',
        retryable: isTimeout || err.retryable || false,
        details: err.details || { errorType: err.name || 'Error' },
      };

      const errorEnvelope: ToolErrorEnvelope = err.errorEnvelope || {
        code: toolError.code,
        category: err.category || (isTimeout ? 'UPSTREAM' : 'VALIDATION'),
        message: toolError.message,
        why: err.why,
        retryable: toolError.retryable || false,
        retryAfterMs: err.retryAfterMs,
        suggestedFix: err.suggestedFix,
        docsRef: err.docsRef,
      };

      return {
        success: false,
        error: toolError,
        errorEnvelope,
        traceId,
        durationMs,
        cost: tool.costEstimate,
      };
    }
  }

  private validateInput(input: any, schema: ToolInputSchema): string | null {
    if (!input || typeof input !== 'object') {
      return 'Input must be a valid JSON object.';
    }

    const requiredFields =
      schema.required ||
      Object.entries(schema.properties)
        .filter(([_, prop]) => prop.required)
        .map(([key]) => key);

    for (const field of requiredFields) {
      if (input[field] === undefined || input[field] === null || input[field] === '') {
        return `Missing required field: '${field}' (${schema.properties[field]?.label || field})`;
      }
    }

    for (const [key, prop] of Object.entries(schema.properties)) {
      const val = input[key];
      if (val === undefined || val === null) continue;

      if (prop.type === 'number') {
        if (typeof val !== 'number') {
          const parsed = Number(val);
          if (isNaN(parsed)) {
            return `Field '${key}' must be a valid number. Received: ${typeof val}`;
          }
          input[key] = parsed;
        }
      } else if (prop.type === 'array') {
        if (!Array.isArray(val)) {
          if (typeof val === 'string') {
            try {
              const parsed = JSON.parse(val);
              if (Array.isArray(parsed)) {
                input[key] = parsed;
              } else {
                input[key] = val
                  .split(/\r?\n/)
                  .map((s: string) => s.trim())
                  .filter(Boolean);
              }
            } catch {
              input[key] = val
                .split(/\r?\n/)
                .map((s: string) => s.trim())
                .filter(Boolean);
            }
          } else {
            return `Field '${key}' must be an array.`;
          }
        }
      } else if (prop.type === 'object') {
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              input[key] = parsed;
            } else {
              return `Field '${key}' must be a valid JSON object.`;
            }
          } catch {
            return `Field '${key}' must be a valid JSON object string.`;
          }
        } else if (typeof val !== 'object' || val === null || Array.isArray(val)) {
          return `Field '${key}' must be an object.`;
        }
      } else if (prop.type === 'boolean') {
        if (typeof val !== 'boolean') {
          if (val === 'true' || val === 1 || val === '1') {
            input[key] = true;
          } else if (val === 'false' || val === 0 || val === '0') {
            input[key] = false;
          }
        }
      }
    }

    return null;
  }
}
