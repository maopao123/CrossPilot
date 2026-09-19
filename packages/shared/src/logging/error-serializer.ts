import {
  ExecutionErrorClass,
  normalizeExecutionError,
} from '../contracts/execution-error.js';
import { sanitizeString } from './log-redaction.js';

export interface SerializedExecutionError {
  errorClass: ExecutionErrorClass;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  provider?: string;
  originalStatus?: number;
  stack?: string;
}

/**
 * Safely serializes any error or NormalizedExecutionError for structured logging.
 *
 * CRITICAL SAFETY REQUIREMENT:
 * NormalizedExecutionError.cause may contain raw Axios/Fetch HTTP requests, authorization headers,
 * or credentials. This function strictly NEVER serializes raw cause objects into the output.
 */
export function serializeExecutionError(err: unknown): SerializedExecutionError {
  const normalized = normalizeExecutionError(err);

  const serialized: SerializedExecutionError = {
    errorClass: normalized.class,
    errorCode: normalized.code,
    errorMessage: sanitizeString(normalized.message || 'Unknown execution error'),
    retryable: normalized.retryable,
  };

  if (normalized.provider) {
    serialized.provider = normalized.provider;
  }

  if (normalized.originalStatus != null) {
    serialized.originalStatus = normalized.originalStatus;
  }

  if (process.env.NODE_ENV !== 'production' && err instanceof Error && err.stack) {
    serialized.stack = sanitizeString(err.stack);
  }

  return serialized;
}
