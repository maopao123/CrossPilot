import pinoDefault, {
  type DestinationStream,
  type Logger as PinoLogger,
  type LoggerOptions,
} from 'pino';
import { type RuntimeLogContext, type LogLevel } from './log-context.js';
import { type RuntimeEventName } from './runtime-events.js';
import { sanitizeLogData, summarizePayload } from './log-redaction.js';
import { serializeExecutionError } from './error-serializer.js';

// Support both CJS and ESM interop for pino import
const pino = (pinoDefault as unknown as { default?: typeof pinoDefault }).default ?? pinoDefault;

export const DEFAULT_PINO_REDACT = [
  'authorization',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  'cookie',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'clientSecret',
  'client_secret',
  'password',
  'apiKey',
  'api_key',
  'payloadEnc',
  'credential',
  '*.authorization',
  '*.accessToken',
  '*.access_token',
  '*.refreshToken',
  '*.refresh_token',
  '*.clientSecret',
  '*.client_secret',
  '*.password',
  '*.apiKey',
  '*.api_key',
  '*.payloadEnc',
  '*.credential',
];

export interface RuntimeLoggerOptions {
  level?: string;
  destination?: DestinationStream;
  baseContext?: RuntimeLogContext;
}

export class StructuredLogger {
  constructor(
    private readonly pinoInstance: PinoLogger,
    private readonly context: RuntimeLogContext = {},
  ) {}

  /**
   * Returns a child logger inheriting current context plus new contextual fields.
   */
  child(additionalContext: RuntimeLogContext): StructuredLogger {
    try {
      const sanitized = sanitizeLogData(additionalContext) as RuntimeLogContext;
      const merged = { ...this.context, ...sanitized };
      return new StructuredLogger(this.pinoInstance.child(sanitized), merged);
    } catch {
      // Fail-safe: never fail application if child logger creation fails
      return this;
    }
  }

  getContext(): RuntimeLogContext {
    return { ...this.context };
  }

  info(data: Record<string, unknown> | string, msg?: string): void {
    this.safeLog('info', data, msg);
  }

  warn(data: Record<string, unknown> | string, msg?: string): void {
    this.safeLog('warn', data, msg);
  }

  error(data: Record<string, unknown> | string, msg?: string): void {
    this.safeLog('error', data, msg);
  }

  debug(data: Record<string, unknown> | string, msg?: string): void {
    this.safeLog('debug', data, msg);
  }

  logEvent(level: LogLevel, event: RuntimeEventName, data?: Record<string, unknown>): void {
    this.safeLog(level, { event, ...data });
  }

  private safeLog(level: LogLevel, data: Record<string, unknown> | string, msg?: string): void {
    try {
      if (typeof data === 'string') {
        if (msg) {
          this.pinoInstance[level]({ msg: data }, msg);
        } else {
          this.pinoInstance[level](data);
        }
        return;
      }

      // Pre-process payload summary if present to avoid leaking raw business objects
      let processedData = { ...data };
      if (processedData.payload && typeof processedData.payload === 'object') {
        processedData.payloadSummary = summarizePayload(processedData.payload);
        delete processedData.payload;
      }

      // Pre-process error objects safely so cause and tokens are NEVER exposed
      const errObj = processedData.error ?? processedData.err ?? processedData.normalizedError;
      if (errObj) {
        const serialized = serializeExecutionError(errObj);
        delete processedData.error;
        delete processedData.err;
        delete processedData.normalizedError;

        processedData.errorClass = processedData.errorClass ?? serialized.errorClass;
        processedData.errorCode = processedData.errorCode ?? serialized.errorCode;
        processedData.errorMessage = processedData.errorMessage ?? serialized.errorMessage;
        processedData.retryable = processedData.retryable ?? serialized.retryable;
        if (serialized.provider) {
          processedData.provider = processedData.provider ?? serialized.provider;
        }
        if (serialized.originalStatus != null) {
          processedData.originalStatus = processedData.originalStatus ?? serialized.originalStatus;
        }
        if (serialized.stack) {
          processedData.stack = processedData.stack ?? serialized.stack;
        }
      }

      // Run recursive sanitizer for double-layer protection
      const sanitized = sanitizeLogData(processedData) as Record<string, unknown>;

      if (msg) {
        this.pinoInstance[level](sanitized, msg);
      } else {
        this.pinoInstance[level](sanitized);
      }
    } catch {
      // Fail-safe: logger failure must NEVER throw or break runtime execution
    }
  }
}

/**
 * Factory to create a configured StructuredLogger.
 */
export function createRuntimeLogger(options?: RuntimeLoggerOptions): StructuredLogger {
  const level =
    options?.level ||
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

  const pinoOpts: LoggerOptions = {
    level,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    base: undefined,
    redact: {
      paths: DEFAULT_PINO_REDACT,
      censor: '[REDACTED]',
    },
  };

  const pinoInstance = options?.destination
    ? pino(pinoOpts, options.destination)
    : pino(pinoOpts);

  return new StructuredLogger(pinoInstance, options?.baseContext || {});
}

/**
 * Global singleton runtime logger for CrossPilot.
 */
export const runtimeLogger = createRuntimeLogger();
