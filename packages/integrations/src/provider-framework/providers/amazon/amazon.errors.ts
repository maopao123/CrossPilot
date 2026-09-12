import { ProviderError, ProviderErrorCode } from '../../core/provider.types.js';
import { SecretProvider } from '../../secrets/secret-provider.js';

export function mapAmazonHttpError(status: number, bodyText: string): ProviderError {
  const safe = SecretProvider.redact(bodyText).slice(0, 400);
  if (status === 401) {
    return { code: 'TOKEN_EXPIRED', message: 'Amazon access token rejected', retryable: true, details: { status, body: safe } };
  }
  if (status === 403) {
    return { code: 'PERMISSION_DENIED', message: 'Amazon role or permission denied', retryable: false, details: { status, body: safe } };
  }
  if (status === 404) {
    return { code: 'NOT_FOUND', message: 'Amazon resource not found', retryable: false, details: { status } };
  }
  if (status === 429) {
    return { code: 'RATE_LIMITED', message: 'Amazon rate limited', retryable: true, details: { status, body: safe } };
  }
  if (status >= 500) {
    return { code: 'PROVIDER_UNAVAILABLE', message: 'Amazon SP-API unavailable', retryable: true, details: { status, body: safe } };
  }
  if (status >= 400) {
    return { code: 'PROVIDER_INVALID_RESPONSE', message: 'Amazon rejected the request', retryable: false, details: { status, body: safe } };
  }
  return { code: 'PROVIDER_EXECUTION_ERROR' as ProviderErrorCode, message: 'Amazon request failed', retryable: false, details: { status, body: safe } };
}

export function amazonAuthRequired(message = 'Amazon selling partner is not connected'): ProviderError {
  return { code: 'AUTH_REQUIRED', message, retryable: false };
}
