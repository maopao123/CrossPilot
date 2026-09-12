import { ErrorCodes } from '@crosspilot/shared';

export class CommercePortError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CommercePortError';
    this.code = code;
  }
}

export function writeForbiddenResult(operation: string): {
  ok: false;
  code: typeof ErrorCodes.WRITE_FORBIDDEN;
  message: string;
  retryable: false;
} {
  return {
    ok: false,
    code: ErrorCodes.WRITE_FORBIDDEN,
    message: `${operation} is WRITE_FORBIDDEN until a write-capable Adapter is explicitly enabled`,
    retryable: false,
  };
}

export function providerUnavailable(platform: string): never {
  throw new CommercePortError(
    ErrorCodes.PROVIDER_UNAVAILABLE,
    `No Commerce Adapter registered for platform=${platform}`,
  );
}
