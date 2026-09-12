import { SecretProvider } from '../../secrets/secret-provider.js';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

export interface LwaTokenResult {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

export async function exchangeLwaRefreshToken(input: {
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
}): Promise<LwaTokenResult> {
  const clientId = input.clientId || SecretProvider.getSecret('AMAZON_LWA_CLIENT_ID');
  const clientSecret = input.clientSecret || SecretProvider.getSecret('AMAZON_LWA_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    const err: any = new Error('Amazon LWA client is not configured');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const fetchFn = input.fetchImpl || fetch;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetchFn(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    const err: any = new Error('Amazon LWA refresh failed');
    err.code = res.status === 401 || res.status === 400 ? 'TOKEN_EXPIRED' : 'PROVIDER_UNAVAILABLE';
    err.details = { status: res.status, body: SecretProvider.redact(text).slice(0, 200) };
    throw err;
  }
  const json = JSON.parse(text) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in,
    refreshToken: json.refresh_token,
  };
}

export async function exchangeLwaAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
}): Promise<LwaTokenResult> {
  const clientId = input.clientId || SecretProvider.getSecret('AMAZON_LWA_CLIENT_ID');
  const clientSecret = input.clientSecret || SecretProvider.getSecret('AMAZON_LWA_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    const err: any = new Error('Amazon LWA client is not configured');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  const fetchFn = input.fetchImpl || fetch;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetchFn(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    const err: any = new Error('Amazon LWA authorization code exchange failed');
    err.code = 'TOKEN_EXPIRED';
    err.details = { status: res.status, body: SecretProvider.redact(text).slice(0, 200) };
    throw err;
  }
  const json = JSON.parse(text) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in,
    refreshToken: json.refresh_token,
  };
}

export function buildAmazonConsentUrl(input: {
  applicationId: string;
  state: string;
  redirectUri?: string;
  region?: 'NA' | 'EU' | 'FE';
}): string {
  const hosts = {
    NA: 'https://sellercentral.amazon.com',
    EU: 'https://sellercentral.amazon.co.uk',
    FE: 'https://sellercentral.amazon.co.jp',
  };
  const host = hosts[input.region || 'NA'];
  const params = new URLSearchParams({
    application_id: input.applicationId,
    state: input.state,
    version: 'beta',
  });
  if (input.redirectUri) params.set('redirect_uri', input.redirectUri);
  return `${host}/apps/authorize/consent?${params.toString()}`;
}
