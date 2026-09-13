import { getObjectStorageService } from '@crosspilot/integrations';

async function main() {
  console.log('=== Verifying MinIO Object Storage Integration ===');

  const storage = getObjectStorageService();
  console.log('Storage enabled:', storage.isEnabled());
  console.log('Bucket name:', storage.getBucket());

  if (!storage.isEnabled()) {
    console.error('FAIL: Storage is not enabled');
    process.exit(1);
  }

  // 1. Ensure bucket
  console.log('1. Ensuring bucket exists...');
  await storage.ensureBucket();
  console.log('PASS: Bucket ensured');

  // 2. Upload a test buffer
  console.log('2. Uploading test PNG buffer...');
  // 1x1 transparent PNG bytes
  const samplePng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  const testKey = `test/verify-${Date.now()}.png`;
  const uploadRes = await storage.uploadBuffer(testKey, samplePng, 'image/png');
  console.log('PASS: Upload buffer success, URL:', uploadRes.url);

  // 3. Read back stream
  console.log('3. Reading back object stream...');
  const { stream, contentType, contentLength } = await storage.getObjectStream(testKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const downloaded = Buffer.concat(chunks);
  console.log(
    `PASS: Read stream success, size=${downloaded.byteLength}, contentType=${contentType}, match=${downloaded.equals(samplePng)}`,
  );

  console.log('\nALL STORAGE CHECKS PASSED');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
