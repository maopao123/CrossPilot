import {
  amazonCredentialEncryptionKey,
  decryptProviderCredential,
  encryptProviderCredential,
} from '@crosspilot/integrations';
import * as crypto from 'node:crypto';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function assertAmazonCredentialKeyForEnvironment(): void {
  if (isProductionEnv() && !process.env.AMAZON_CREDENTIAL_ENCRYPTION_KEY) {
    throw new Error(
      'AMAZON_CREDENTIAL_ENCRYPTION_KEY is required when NODE_ENV=production',
    );
  }
}

// Canonical implementation lives in @crosspilot/integrations so non-API
// packages (e.g. @crosspilot/db commerce adapters) can decrypt the same
// ProviderCredential payloads. Aliases keep existing imports working.
export function encryptionKey(): Buffer {
  return amazonCredentialEncryptionKey();
}

export function encryptSecret(plain: string): string {
  return encryptProviderCredential(plain);
}

export function decryptSecret(payloadEnc: string): string {
  return decryptProviderCredential(payloadEnc);
}

export function signOAuthState(payload: Record<string, string>): string {
  const body = { ...payload, ts: payload.ts || String(Date.now()) };
  const json = Buffer.from(JSON.stringify(body)).toString('base64url');
  const mac = crypto.createHmac('sha256', encryptionKey()).update(json).digest('base64url');
  return `${json}.${mac}`;
}

export function verifyOAuthState(state: string): Record<string, string> {
  const [json, mac] = state.split('.');
  if (!json || !mac) {
    throw Object.assign(new Error('Invalid OAuth state'), { code: 'AUTH_UNAUTHORIZED' });
  }
  const expected = crypto.createHmac('sha256', encryptionKey()).update(json).digest('base64url');
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw Object.assign(new Error('Invalid OAuth state'), { code: 'AUTH_UNAUTHORIZED' });
  }
  const parsed = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as Record<string, string>;
  const ts = Number(parsed.ts);
  if (!Number.isFinite(ts) || Date.now() - ts > OAUTH_STATE_TTL_MS) {
    throw Object.assign(new Error('OAuth state expired'), { code: 'AUTH_UNAUTHORIZED' });
  }
  return parsed;
}
