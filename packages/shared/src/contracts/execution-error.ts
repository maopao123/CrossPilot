export type ExecutionErrorClass =
  | 'TRANSIENT'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'AUTH'
  | 'PERMISSION'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'PROVIDER_ERROR'
  | 'RPA_SELECTOR'
  | 'RPA_NAVIGATION'
  | 'VERIFY_MISMATCH'
  | 'UNKNOWN';

export interface NormalizedExecutionError {
  class: ExecutionErrorClass;
  code: string;
  message: string;
  retryable: boolean;
  provider?: string;
  originalStatus?: number;
  cause?: unknown;
}

export interface ErrorNormalizationOptions {
  provider?: string;
  originalStatus?: number;
  code?: string;
  retryable?: boolean;
  defaultClass?: ExecutionErrorClass;
}

/**
 * Normalizes any error (HTTP, GraphQL, RPA, Domain, Network, or unknown)
 * into a strongly-typed NormalizedExecutionError with standard error classification.
 */
export function normalizeExecutionError(
  err: unknown,
  options?: ErrorNormalizationOptions,
): NormalizedExecutionError {
  // If already a NormalizedExecutionError object
  if (
    typeof err === 'object' &&
    err !== null &&
    'class' in err &&
    'code' in err &&
    'message' in err &&
    'retryable' in err
  ) {
    const existing = err as NormalizedExecutionError;
    return {
      ...existing,
      ...(options?.provider ? { provider: options.provider } : {}),
      ...(options?.originalStatus != null ? { originalStatus: options.originalStatus } : {}),
    };
  }

  const provider = options?.provider;
  let originalStatus = options?.originalStatus;
  let code = options?.code;
  let message = '';
  let cause: unknown = err;

  if (err instanceof Error) {
    message = err.message || err.name;
    cause = err;
    if ((err as any).status && typeof (err as any).status === 'number') {
      originalStatus = originalStatus ?? (err as any).status;
    }
    if ((err as any).statusCode && typeof (err as any).statusCode === 'number') {
      originalStatus = originalStatus ?? (err as any).statusCode;
    }
    if ((err as any).code && typeof (err as any).code === 'string') {
      code = code ?? (err as any).code;
    }
  } else if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    message = String(obj.errorMessage || obj.message || obj.error || '');
    if (typeof obj.statusCode === 'number') originalStatus = originalStatus ?? obj.statusCode;
    if (typeof obj.status === 'number') originalStatus = originalStatus ?? obj.status;
    if (typeof obj.errorCode === 'string') code = code ?? obj.errorCode;
    if (typeof obj.code === 'string') code = code ?? obj.code;
  } else if (typeof err === 'string') {
    message = err;
  } else {
    message = String(err);
  }

  // Extract leading code prefix from message (e.g. "AUTH_REQUIRED: ...", "CONFIG_ERROR: ...")
  if (!code && message) {
    const match = message.match(/^([A-Z0-9_]{3,30}):\s*(.*)$/);
    if (match) {
      code = match[1];
    }
  }

  // 1. Explicit HTTP Status Mapping
  if (originalStatus != null) {
    if (originalStatus === 429) {
      return {
        class: 'RATE_LIMIT',
        code: code || 'RATE_LIMITED',
        message: message || 'Rate limit exceeded (HTTP 429)',
        retryable: true,
        provider,
        originalStatus,
        cause,
      };
    }
    if (originalStatus === 401) {
      return {
        class: 'AUTH',
        code: code || 'AUTH_REQUIRED',
        message: message || 'Authentication failed (HTTP 401)',
        retryable: false,
        provider,
        originalStatus,
        cause,
      };
    }
    if (originalStatus === 403) {
      const isAuthCode = code === 'AUTH_REQUIRED' || code === 'AUTH_FAILED' || code === 'TOKEN_EXPIRED';
      return {
        class: isAuthCode ? 'AUTH' : 'PERMISSION',
        code: code || (isAuthCode ? 'AUTH_REQUIRED' : 'PERMISSION_DENIED'),
        message: message || (isAuthCode ? 'Authentication failed (HTTP 403)' : 'Permission denied (HTTP 403)'),
        retryable: false,
        provider,
        originalStatus,
        cause,
      };
    }
    if (originalStatus === 400 || originalStatus === 422) {
      return {
        class: 'VALIDATION',
        code: code || 'VALIDATION_ERROR',
        message: message || `Validation error (HTTP ${originalStatus})`,
        retryable: false,
        provider,
        originalStatus,
        cause,
      };
    }
    if (originalStatus === 404) {
      return {
        class: 'NOT_FOUND',
        code: code || 'NOT_FOUND',
        message: message || 'Resource not found (HTTP 404)',
        retryable: false,
        provider,
        originalStatus,
        cause,
      };
    }
    if (originalStatus === 409) {
      return {
        class: 'CONFLICT',
        code: code || 'CONFLICT',
        message: message || 'Resource conflict (HTTP 409)',
        retryable: false,
        provider,
        originalStatus,
        cause,
      };
    }
    if (originalStatus === 408 || originalStatus === 504) {
      return {
        class: 'TIMEOUT',
        code: code || 'GATEWAY_TIMEOUT',
        message: message || `Request timed out (HTTP ${originalStatus})`,
        retryable: false, // Side-effect safety: unknown whether applied remotely
        provider,
        originalStatus,
        cause,
      };
    }
    if (originalStatus >= 500) {
      return {
        class: 'TRANSIENT',
        code: code || `HTTP_${originalStatus}`,
        message: message || `Provider server error (HTTP ${originalStatus})`,
        retryable: true,
        provider,
        originalStatus,
        cause,
      };
    }
  }

  // 2. Specific Error Code Mapping
  const normalizedCode = String(code || '').toUpperCase();
  if (
    normalizedCode === 'RATE_LIMITED' ||
    normalizedCode === 'PROVIDER_RATE_LIMIT' ||
    normalizedCode === 'THROTTLED' ||
    normalizedCode === 'TOO_MANY_REQUESTS'
  ) {
    return {
      class: 'RATE_LIMIT',
      code: code || 'RATE_LIMITED',
      message: message || 'Rate limit exceeded',
      retryable: true,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'AUTH_FAILED' ||
    normalizedCode === 'AUTH_REQUIRED' ||
    normalizedCode === 'UNAUTHORIZED' ||
    normalizedCode === 'ACCESS_DENIED' ||
    normalizedCode === 'TOKEN_EXPIRED'
  ) {
    return {
      class: 'AUTH',
      code: code || 'AUTH_REQUIRED',
      message: message || 'Authentication failed',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (normalizedCode === 'PROVIDER_UNAVAILABLE') {
    const isRetryable = options?.retryable ?? false;
    return {
      class: isRetryable ? 'TRANSIENT' : 'PROVIDER_ERROR',
      code: code || 'PROVIDER_UNAVAILABLE',
      message: message || (isRetryable ? 'Provider temporarily unavailable' : 'Provider unavailable'),
      retryable: isRetryable,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'COMMERCE_PORT_ERROR' ||
    normalizedCode === 'COMMERCE_ERROR'
  ) {
    return {
      class: 'PROVIDER_ERROR',
      code: code || 'COMMERCE_PORT_ERROR',
      message: message || 'Commerce port downstream error',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'BAD_USER_INPUT' ||
    normalizedCode === 'GRAPHQL_VALIDATION_FAILED' ||
    normalizedCode === 'USER_ERROR' ||
    normalizedCode === 'VARIABLE_VALUE_INVALID'
  ) {
    return {
      class: 'VALIDATION',
      code: code || 'VALIDATION_ERROR',
      message: message || 'GraphQL user or validation error',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (normalizedCode === 'GRAPHQL_ERROR' || normalizedCode === 'COMMERCE_GRAPHQL_ERROR') {
    return {
      class: 'PROVIDER_ERROR',
      code: code || 'GRAPHQL_ERROR',
      message: message || 'GraphQL downstream error',
      retryable: options?.retryable ?? false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'WRITE_FORBIDDEN' ||
    normalizedCode === 'FORBIDDEN' ||
    normalizedCode === 'PERMISSION_DENIED' ||
    normalizedCode === 'DEMO_PAYLOAD_FORBIDDEN'
  ) {
    return {
      class: 'PERMISSION',
      code: code || 'WRITE_FORBIDDEN',
      message: message || 'Action is forbidden by permission guard',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'NOT_FOUND' ||
    normalizedCode === 'RESOURCE_NOT_FOUND' ||
    normalizedCode === 'SUPPLIER_NOT_FOUND'
  ) {
    return {
      class: 'NOT_FOUND',
      code: code || 'NOT_FOUND',
      message: message || 'Resource not found',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'IDEMPOTENCY_CONFLICT' ||
    normalizedCode === 'OCC_VERSION_CONFLICT' ||
    normalizedCode === 'CONFLICT'
  ) {
    return {
      class: 'CONFLICT',
      code: code || 'IDEMPOTENCY_CONFLICT',
      message: message || 'Concurrent or idempotency conflict detected',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'VALIDATION_ERROR' ||
    normalizedCode === 'CONFIG_ERROR' ||
    normalizedCode === 'PAYLOAD_TAMPERED' ||
    normalizedCode === 'INVALID_MODE' ||
    normalizedCode === 'INVALID_PROVIDER_FOR_MODE' ||
    normalizedCode === 'UNSUPPORTED_RUNTIME' ||
    normalizedCode === 'UNSUPPORTED_WORKFLOW' ||
    normalizedCode === 'UNSUPPORTED'
  ) {
    return {
      class: 'VALIDATION',
      code: code || 'VALIDATION_ERROR',
      message: message || 'Validation or configuration error',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'TIMEOUT' ||
    normalizedCode === 'PAGE_TIMEOUT' ||
    normalizedCode === 'QUERY_TIMEOUT_MAX'
  ) {
    return {
      class: 'TIMEOUT',
      code: code || 'TIMEOUT',
      message: message || 'Operation timed out',
      retryable: false, // Unknown side-effect: never blindly retry
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'CANCELLED' ||
    normalizedCode === 'ABORTED' ||
    normalizedCode === 'EXTERNAL_CANCEL'
  ) {
    return {
      class: 'TIMEOUT',
      code: code || 'CANCELLED',
      message: message || 'Operation was cancelled by caller',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'SELECTOR_NOT_FOUND' ||
    normalizedCode === 'RPA_SELECTOR_FAILED'
  ) {
    return {
      class: 'RPA_SELECTOR',
      code: code || 'SELECTOR_NOT_FOUND',
      message: message || 'RPA selector or element locator not found',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'RPA_NAVIGATION' ||
    normalizedCode === 'NAVIGATION_FAILED'
  ) {
    return {
      class: 'RPA_NAVIGATION',
      code: code || 'NAVIGATION_FAILED',
      message: message || 'RPA page navigation failed',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    normalizedCode === 'VERIFY_FAILED' ||
    normalizedCode === 'VERIFY_MISMATCH' ||
    normalizedCode === 'TARGET_MISMATCH' ||
    normalizedCode === 'TARGET_UNVERIFIABLE' ||
    normalizedCode === 'REMOTE_PAYLOAD_MISMATCH' ||
    normalizedCode === 'UNVERIFIED_LIVE_EXECUTION'
  ) {
    return {
      class: 'VERIFY_MISMATCH',
      code: code || 'VERIFY_MISMATCH',
      message: message || 'Read-back or remote payload verification mismatch',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  // 3. Exception Names and System Codes
  const errObj = err as any;
  const errName = String(errObj?.name || '');
  const sysCode = String(errObj?.code || '');

  if (
    errName === 'AbortError' ||
    errName === 'TimeoutError' ||
    sysCode === 'UND_ERR_CONNECT_TIMEOUT' ||
    sysCode === 'ETIMEDOUT' ||
    sysCode === 'ESOCKETTIMEDOUT'
  ) {
    return {
      class: 'TIMEOUT',
      code: sysCode || 'TIMEOUT',
      message: message || 'Request was aborted due to timeout',
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    sysCode === 'ECONNRESET' ||
    sysCode === 'ECONNREFUSED' ||
    sysCode === 'EPIPE' ||
    sysCode === 'ENOTFOUND' ||
    sysCode === 'EAI_AGAIN'
  ) {
    return {
      class: 'TRANSIENT',
      code: sysCode || 'NETWORK_RESET',
      message: message || `Network connection error (${sysCode})`,
      retryable: true,
      provider,
      originalStatus,
      cause,
    };
  }

  // 4. Message-based Heuristics (Fallback)
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('throttled') || lowerMsg.includes('rate limit')) {
    return {
      class: 'RATE_LIMIT',
      code: code || 'RATE_LIMITED',
      message,
      retryable: true,
      provider,
      originalStatus,
      cause,
    };
  }

  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
    return {
      class: 'TIMEOUT',
      code: code || 'TIMEOUT',
      message,
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    lowerMsg.includes('econnreset') ||
    lowerMsg.includes('connection reset') ||
    lowerMsg.includes('socket hang up') ||
    lowerMsg.includes('fetch failed') ||
    lowerMsg.includes('network error')
  ) {
    return {
      class: 'TRANSIENT',
      code: code || 'NETWORK_ERROR',
      message,
      retryable: true,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    lowerMsg.includes('access denied') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('authentication failed') ||
    lowerMsg.includes('token invalid')
  ) {
    return {
      class: 'AUTH',
      code: code || 'AUTH_REQUIRED',
      message,
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (lowerMsg.includes('forbidden') || lowerMsg.includes('write_forbidden')) {
    return {
      class: 'PERMISSION',
      code: code || 'WRITE_FORBIDDEN',
      message,
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    lowerMsg.includes('waiting for locator') ||
    lowerMsg.includes('waiting for selector') ||
    lowerMsg.includes('selector_not_found') ||
    lowerMsg.includes('locate_sku')
  ) {
    return {
      class: 'RPA_SELECTOR',
      code: code || 'SELECTOR_NOT_FOUND',
      message,
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    lowerMsg.includes('page.goto') ||
    lowerMsg.includes('navigation failed') ||
    lowerMsg.includes('net::err_')
  ) {
    return {
      class: 'RPA_NAVIGATION',
      code: code || 'NAVIGATION_FAILED',
      message,
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    lowerMsg.includes('verify_failed') ||
    lowerMsg.includes('target_mismatch') ||
    lowerMsg.includes('target_unverifiable') ||
    lowerMsg.includes('payload_mismatch')
  ) {
    return {
      class: 'VERIFY_MISMATCH',
      code: code || 'VERIFY_MISMATCH',
      message,
      retryable: false,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    lowerMsg.includes('provider_unavailable') ||
    lowerMsg.includes('provider unavailable') ||
    lowerMsg.includes('failed to reach shopify')
  ) {
    const isRetryable = options?.retryable ?? false;
    return {
      class: isRetryable ? 'TRANSIENT' : 'PROVIDER_ERROR',
      code: code || 'PROVIDER_UNAVAILABLE',
      message,
      retryable: isRetryable,
      provider,
      originalStatus,
      cause,
    };
  }

  if (
    lowerMsg.includes('local_sync_failed') ||
    lowerMsg.includes('save_failed') ||
    lowerMsg.includes('commerce_port_error')
  ) {
    return {
      class: 'PROVIDER_ERROR',
      code: code || 'PROVIDER_ERROR',
      message,
      retryable: options?.retryable ?? false,
      provider,
      originalStatus,
      cause,
    };
  }

  // 5. Default Fallback
  return {
    class: options?.defaultClass || (options?.retryable ? 'TRANSIENT' : 'UNKNOWN'),
    code:
      code ||
      (options?.defaultClass
        ? String(options.defaultClass)
        : options?.retryable
          ? 'TRANSIENT_ERROR'
          : 'UNKNOWN_ERROR'),
    message: message || 'An unknown execution error occurred',
    retryable:
      options?.retryable ??
      (options?.defaultClass === 'TRANSIENT' || options?.defaultClass === 'RATE_LIMIT'),
    provider,
    originalStatus,
    cause,
  };
}
