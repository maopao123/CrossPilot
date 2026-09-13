import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { SecretProvider } from '../provider-framework/secrets/secret-provider.js';
import type { Readable } from 'node:stream';

export interface ObjectStorageConfig {
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
  region?: string;
  publicUrlPrefix?: string;
  forcePathStyle?: boolean;
}

export interface UploadResult {
  key: string;
  url: string;
  sizeBytes?: number;
  contentType?: string;
}

export class ObjectStorageService {
  private readonly client: S3Client | null = null;
  private readonly bucket: string;
  private readonly publicUrlPrefix: string;
  private readonly enabled: boolean;
  private bucketChecked = false;

  constructor(config: ObjectStorageConfig = {}) {
    const endpoint =
      config.endpoint ||
      SecretProvider.getSecret('MINIO_ENDPOINT') ||
      SecretProvider.getSecret('STORAGE_ENDPOINT') ||
      'http://127.0.0.1:9002';

    const accessKeyId =
      config.accessKeyId ||
      SecretProvider.getSecret('MINIO_ACCESS_KEY') ||
      SecretProvider.getSecret('STORAGE_ACCESS_KEY') ||
      'minioadmin';

    const secretAccessKey =
      config.secretAccessKey ||
      SecretProvider.getSecret('MINIO_SECRET_KEY') ||
      SecretProvider.getSecret('STORAGE_SECRET_KEY') ||
      'minioadmin';

    this.bucket =
      config.bucket ||
      SecretProvider.getSecret('MINIO_BUCKET') ||
      SecretProvider.getSecret('STORAGE_BUCKET') ||
      'crosspilot-assets';

    const region =
      config.region ||
      SecretProvider.getSecret('MINIO_REGION') ||
      SecretProvider.getSecret('STORAGE_REGION') ||
      'us-east-1';

    this.publicUrlPrefix = (
      config.publicUrlPrefix ||
      SecretProvider.getSecret('STORAGE_PUBLIC_PREFIX') ||
      '/assets'
    ).replace(/\/+$/, '');

    // Allow explicitly disabling storage by setting STORAGE_DISABLED=true or MINIO_DISABLED=true
    const disabled =
      SecretProvider.getSecret('STORAGE_DISABLED') === 'true' ||
      SecretProvider.getSecret('MINIO_DISABLED') === 'true';

    if (disabled || !endpoint) {
      this.enabled = false;
      return;
    }

    try {
      this.client = new S3Client({
        endpoint,
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        forcePathStyle: config.forcePathStyle ?? true,
      });
      this.enabled = true;
    } catch {
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  getBucket(): string {
    return this.bucket;
  }

  getPublicUrl(key: string): string {
    const cleanKey = key.replace(/^\/+/, '');
    return `${this.publicUrlPrefix}/${cleanKey}`;
  }

  async ensureBucket(): Promise<void> {
    if (!this.client || this.bucketChecked) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.bucketChecked = true;
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.bucketChecked = true;
        } catch {
          // bucket might already exist or permission restricted
        }
      } else {
        this.bucketChecked = true;
      }
    }
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer | Uint8Array,
    contentType = 'image/png',
  ): Promise<UploadResult> {
    if (!this.client) {
      throw new Error('ObjectStorageService is not enabled or configured.');
    }

    await this.ensureBucket();
    const cleanKey = key.replace(/^\/+/, '');

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return {
      key: cleanKey,
      url: this.getPublicUrl(cleanKey),
      sizeBytes: buffer.byteLength,
      contentType,
    };
  }

  /**
   * Downloads a resource from an external URL and uploads it to storage.
   */
  async uploadFromUrl(
    key: string,
    sourceUrl: string,
    fallbackContentType = 'image/png',
    timeoutMs = 30000,
  ): Promise<UploadResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(sourceUrl, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Failed to fetch source image: HTTP ${res.status} ${res.statusText}`);
      }

      const contentType = res.headers.get('content-type') || fallbackContentType;
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return await this.uploadBuffer(key, buffer, contentType);
    } finally {
      clearTimeout(timer);
    }
  }

  async getObjectStream(key: string): Promise<{
    stream: Readable;
    contentType?: string;
    contentLength?: number;
  }> {
    if (!this.client) {
      throw new Error('ObjectStorageService is not enabled or configured.');
    }

    const cleanKey = key.replace(/^\/+/, '');
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      }),
    );

    return {
      stream: res.Body as Readable,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
    };
  }
}

// Global default singleton instance
let defaultStorageInstance: ObjectStorageService | null = null;

export function getObjectStorageService(): ObjectStorageService {
  if (!defaultStorageInstance) {
    defaultStorageInstance = new ObjectStorageService();
  }
  return defaultStorageInstance;
}

export function setObjectStorageService(service: ObjectStorageService): void {
  defaultStorageInstance = service;
}
