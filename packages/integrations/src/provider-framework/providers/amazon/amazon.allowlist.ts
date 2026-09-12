/**
 * Epic 4 read-only allowlist. Any method other than GET, or a path
 * outside this list, is WRITE_FORBIDDEN.
 */
const ALLOWED_GET_PATTERNS: RegExp[] = [
  /^\/sellers\/v1\/marketplaceParticipations$/,
  /^\/listings\/2021-08-01\/items(\/[^?]*)?$/,
  /^\/catalog\/2022-04-01\/items\/[^/]+$/,
  /^\/orders\/2026-01-01\/orders(\/[^?]*)?$/,
  /^\/fba\/inventory\/v1\/summaries$/,
  /^\/finances\/2024-06-19\/transactions$/,
];

export function assertAmazonReadOnly(method: string, pathWithQuery: string): void {
  const methodUpper = method.toUpperCase();
  const path = pathWithQuery.split('?')[0];
  if (methodUpper !== 'GET') {
    const err: any = new Error(`Amazon write APIs are forbidden in Epic 4: ${methodUpper} ${path}`);
    err.code = 'WRITE_FORBIDDEN';
    throw err;
  }
  if (!ALLOWED_GET_PATTERNS.some((re) => re.test(path))) {
    const err: any = new Error(`Amazon path is not on the Epic 4 read allowlist: ${path}`);
    err.code = 'WRITE_FORBIDDEN';
    throw err;
  }
}

export function isAmazonReadAllowed(method: string, pathWithQuery: string): boolean {
  try {
    assertAmazonReadOnly(method, pathWithQuery);
    return true;
  } catch {
    return false;
  }
}
