import * as crypto from 'node:crypto';

const DEV_FALLBACK_KEY = 'dev-amazon-cred-key';
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

function encryptionKey(): Buffer {
  if (isProductionEnv()) {
    const prod = process.env.AMAZON_CREDENTIAL_ENCRYPTION_KEY;
    if (!prod) {
      throw new Error(
        'AMAZON_CREDENTIAL_ENCRYPTION_KEY is required when NODE_ENV=production',
      );
    }
    return crypto.createHash('sha256').update(prod).digest();
  }
  const raw =
    process.env.AMAZON_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    DEV_FALLBACK_KEY;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payloadEnc: string): string {
  const buf = Buffer.from(payloadEnc, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
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
