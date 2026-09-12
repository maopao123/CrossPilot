import * as crypto from 'node:crypto';

const DEV_FALLBACK_KEY = 'dev-amazon-cred-key';

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * AES-256-GCM key for ProviderCredential payloads. Key material order is a
 * frozen contract: production requires AMAZON_CREDENTIAL_ENCRYPTION_KEY;
 * non-production falls back to JWT_SECRET then a dev key so local rows and
 * production rows never silently diverge.
 */
export function amazonCredentialEncryptionKey(): Buffer {
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

export function encryptProviderCredential(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', amazonCredentialEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptProviderCredential(payloadEnc: string): string {
  const buf = Buffer.from(payloadEnc, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', amazonCredentialEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
