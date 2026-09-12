import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ErrorCodes } from '@crosspilot/shared';
import {
  AmazonProvider,
  IntegrationGateway,
  MockAmazonProvider,
  STORE_CAPABILITIES,
  SecretProvider,
  buildAmazonConsentUrl,
  exchangeLwaAuthorizationCode,
  exchangeLwaRefreshToken,
  mapFinances,
  mapInventorySummaries,
  mapListingsSearch,
  mapOrders,
  mapParticipations,
} from '@crosspilot/integrations';
import {
  decryptSecret,
  encryptSecret,
  isProductionEnv,
  signOAuthState,
  verifyOAuthState,
} from './credential-crypto.js';

const SYNC_CAPABILITIES = [
  STORE_CAPABILITIES.participations,
  STORE_CAPABILITIES.listingsSearch,
  STORE_CAPABILITIES.ordersSearch,
  STORE_CAPABILITIES.inventorySummaries,
  STORE_CAPABILITIES.financesTransactions,
] as const;

@Injectable()
export class CommerceStoreService {
  private readonly mockProvider = new MockAmazonProvider();

  constructor(private readonly prisma: PrismaService) {}

  async listAccounts(workspaceId: string) {
    const accounts = await this.prisma.commerceAccount.findMany({
      where: { workspaceId },
      select: {
        id: true,
        provider: true,
        sellingPartnerId: true,
        region: true,
        status: true,
        defaultMarketplaceCode: true,
        updatedAt: true,
      },
    });
    return { accounts, amazonConfigured: Boolean(SecretProvider.getSecret('AMAZON_LWA_CLIENT_ID')) };
  }

  async startAmazonOAuth(workspaceId: string, userId: string, region: 'NA' | 'EU' | 'FE' = 'NA') {
    const clientId = SecretProvider.getSecret('AMAZON_LWA_CLIENT_ID');
    const applicationId = SecretProvider.getSecret('AMAZON_APPLICATION_ID') || clientId;
    const redirectUri = SecretProvider.getSecret('AMAZON_LWA_REDIRECT_URI');
    if (!clientId || !applicationId) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_REQUIRED,
        message: 'Amazon LWA client is not configured on this deployment',
      });
    }
    await this.prisma.commerceAccount.upsert({
      where: { workspaceId_provider: { workspaceId, provider: 'amazon' } },
      create: { workspaceId, provider: 'amazon', region, status: 'AUTH_REQUIRED' },
      update: { region, status: 'AUTH_REQUIRED' },
    });
    const state = signOAuthState({ workspaceId, userId, ts: String(Date.now()) });
    return {
      authorizationUrl: buildAmazonConsentUrl({
        applicationId,
        state,
        redirectUri,
        region,
      }),
      state,
    };
  }

  async handleAmazonOAuthCallback(query: {
    code?: string;
    state?: string;
    spapi_oauth_code?: string;
    selling_partner_id?: string;
  }) {
    const code = query.code || query.spapi_oauth_code;
    const state = query.state;
    if (!code || !state) {
      throw new UnauthorizedException({ code: ErrorCodes.AUTH_REQUIRED, message: 'Missing Amazon OAuth code or state' });
    }
    const parsed = verifyOAuthState(state);
    const redirectUri = SecretProvider.getSecret('AMAZON_LWA_REDIRECT_URI') || '';
    const tokens = await exchangeLwaAuthorizationCode({ code, redirectUri });
    if (!tokens.refreshToken) {
      throw new UnauthorizedException({ code: ErrorCodes.TOKEN_EXPIRED, message: 'Amazon did not return a refresh token' });
    }
    const sellingPartnerId = query.selling_partner_id || undefined;
    const account = await this.prisma.commerceAccount.upsert({
      where: { workspaceId_provider: { workspaceId: parsed.workspaceId, provider: 'amazon' } },
      create: {
        workspaceId: parsed.workspaceId,
        provider: 'amazon',
        status: 'CONNECTED',
        sellingPartnerId,
      },
      update: { status: 'CONNECTED', sellingPartnerId: sellingPartnerId || undefined },
    });
    await this.prisma.providerCredential.upsert({
      where: { accountId_kind: { accountId: account.id, kind: 'LWA_REFRESH' } },
      create: {
        accountId: account.id,
        kind: 'LWA_REFRESH',
        payloadEnc: encryptSecret(tokens.refreshToken),
      },
      update: { payloadEnc: encryptSecret(tokens.refreshToken) },
    });
    await this.hydrateSellerIdentity(account.id, tokens.refreshToken, sellingPartnerId);
    return { workspaceId: parsed.workspaceId, accountId: account.id, status: 'CONNECTED' };
  }

  async sync(
    workspaceId: string,
    role: string,
    input: { capability?: string; useMock?: boolean },
  ) {
    if (role === 'VIEWER') {
      throw new ForbiddenException({ code: ErrorCodes.AUTH_FORBIDDEN, message: 'VIEWER cannot sync store data' });
    }
    const capability = input.capability || 'all';
    const targets = capability === 'all'
      ? [...SYNC_CAPABILITIES]
      : SYNC_CAPABILITIES.filter((c) => c === capability);
    if (targets.length === 0) {
      throw new NotFoundException({ code: ErrorCodes.RESOURCE_NOT_FOUND, message: 'Unknown store capability' });
    }

    const account = await this.ensureAccount(workspaceId);
    const useMock = this.resolveMockMode(input.useMock);
    if (!useMock && !(await this.hasRefreshToken(account.id))) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_REQUIRED,
        message: 'Amazon selling partner is not connected',
      });
    }
    const results = [];
    for (const cap of targets) {
      results.push(await this.runOne(workspaceId, account.id, cap, useMock, role));
    }
    return { accountId: account.id, useMock, runs: results };
  }

  async listSyncRuns(workspaceId: string) {
    return this.prisma.syncRun.findMany({
      where: { workspaceId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
  }

  private async ensureAccount(workspaceId: string) {
    return this.prisma.commerceAccount.upsert({
      where: { workspaceId_provider: { workspaceId, provider: 'amazon' } },
      create: { workspaceId, provider: 'amazon', status: 'DISCONNECTED' },
      update: {},
    });
  }

  private resolveMockMode(useMock?: boolean): boolean {
    if (useMock !== true) return false;
    if (isProductionEnv()) {
      throw new ForbiddenException({
        code: ErrorCodes.WRITE_FORBIDDEN,
        message: 'Mock Amazon sync is not allowed in production',
      });
    }
    return true;
  }

  private async hydrateSellerIdentity(
    accountId: string,
    refreshToken: string,
    sellingPartnerId?: string,
  ) {
    try {
      const tok = await exchangeLwaRefreshToken({ refreshToken });
      const account = await this.prisma.commerceAccount.findUnique({ where: { id: accountId } });
      const provider = new AmazonProvider({
        getAccessToken: async () => tok.accessToken,
      });
      const result = await provider.execute(
        STORE_CAPABILITIES.participations,
        {
          capabilityId: STORE_CAPABILITIES.participations,
          providerId: 'amazon',
          transport: 'HTTP',
          enabled: true,
          priority: 100,
        },
        { region: account?.region, sellingPartnerId },
        { workspaceId: account?.workspaceId || 'unknown', traceId: `oauth-${accountId}` },
      );
      const rows = Array.isArray(result.data) ? result.data : [];
      const us = rows.find((r: any) => r.marketplaceId === 'ATVPDKIKX0DER') || rows[0];
      await this.prisma.commerceAccount.update({
        where: { id: accountId },
        data: {
          sellingPartnerId: sellingPartnerId || account?.sellingPartnerId,
          defaultMarketplaceCode: us?.marketplaceId === 'ATVPDKIKX0DER' ? 'AMAZON_US' : account?.defaultMarketplaceCode,
          status: sellingPartnerId || account?.sellingPartnerId ? 'CONNECTED' : 'AUTH_REQUIRED',
        },
      });
    } catch {
      if (sellingPartnerId) {
        await this.prisma.commerceAccount.update({
          where: { id: accountId },
          data: { sellingPartnerId, status: 'CONNECTED' },
        });
      }
    }
  }

  private async hasRefreshToken(accountId: string): Promise<boolean> {
    const cred = await this.prisma.providerCredential.findUnique({
      where: { accountId_kind: { accountId, kind: 'LWA_REFRESH' } },
    });
    return Boolean(cred?.payloadEnc);
  }

  private async runOne(
    workspaceId: string,
    accountId: string,
    capability: string,
    useMock: boolean,
    _role: string,
  ) {
    const run = await this.prisma.syncRun.create({
      data: { workspaceId, accountId, capability, status: 'RUNNING' },
    });
    const started = Date.now();
    try {
      const data = await this.fetchCapability(workspaceId, accountId, capability, useMock);
      const recordsProcessed = await this.persist(workspaceId, accountId, capability, data);
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          recordsProcessed,
          durationMs: Date.now() - started,
        },
      });
      if (!useMock) {
        await this.prisma.commerceAccount.update({
          where: { id: accountId },
          data: { status: 'CONNECTED' },
        });
      }
      return { id: run.id, capability, status: 'COMPLETED', recordsProcessed, useMock };
    } catch (err: any) {
      const errorCode = err.code || ErrorCodes.SYNC_FAILED;
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorCode,
          durationMs: Date.now() - started,
        },
      });
      return { id: run.id, capability, status: 'FAILED', errorCode, useMock };
    }
  }

  private async fetchCapability(
    workspaceId: string,
    accountId: string,
    capability: string,
    useMock: boolean,
  ) {
    const context = { workspaceId, traceId: `sync-${Date.now()}` };
    const binding = {
      capabilityId: capability,
      providerId: useMock ? 'mock-amazon' : 'amazon',
      transport: useMock ? 'NATIVE' : 'HTTP',
      enabled: true,
      priority: 1,
    } as const;

    if (useMock) {
      const result = await this.mockProvider.execute(capability, binding as any, {}, context);
      if (!result.success) {
        throw Object.assign(new Error(result.error?.message || 'mock failed'), { code: result.error?.code });
      }
      return result.data;
    }

    const cred = await this.prisma.providerCredential.findUnique({
      where: { accountId_kind: { accountId, kind: 'LWA_REFRESH' } },
    });
    if (!cred) {
      throw Object.assign(new Error('Amazon selling partner is not connected'), { code: ErrorCodes.AUTH_REQUIRED });
    }
    const refreshToken = decryptSecret(cred.payloadEnc);
    const account = await this.prisma.commerceAccount.findUnique({ where: { id: accountId } });
    if (
      (capability === STORE_CAPABILITIES.listingsSearch || capability === STORE_CAPABILITIES.listingsGet) &&
      !account?.sellingPartnerId
    ) {
      throw Object.assign(new Error('Amazon sellingPartnerId is required for listing sync'), {
        code: ErrorCodes.AUTH_REQUIRED,
      });
    }
    const tok = await exchangeLwaRefreshToken({ refreshToken });
    const gateway = IntegrationGateway.getInstance();
    const result = await gateway.executeCapability(
      capability,
      { sellingPartnerId: account?.sellingPartnerId, region: account?.region },
      {
        workspaceId,
        traceId: context.traceId,
        marketplace: account?.defaultMarketplaceCode || 'AMAZON_US',
        metadata: {
          skipProviderFallback: true,
          amazonAccessToken: tok.accessToken,
        },
      },
    );
    if (!result.success) {
      throw Object.assign(new Error(result.error?.message || 'Amazon sync failed'), {
        code: result.error?.code || ErrorCodes.SYNC_FAILED,
      });
    }
    return result.data;
  }

  private skuMatchWhere(workspaceId: string, sellerSku: string, asin?: string) {
    const or: Array<Record<string, string>> = [{ skuCode: sellerSku }, { amazonSellerSku: sellerSku }];
    const trimmedAsin = typeof asin === 'string' ? asin.trim() : '';
    if (trimmedAsin) or.push({ asin: trimmedAsin });
    return { workspaceId, OR: or };
  }

  private async persist(workspaceId: string, accountId: string, capability: string, data: any): Promise<number> {
    if (capability === STORE_CAPABILITIES.participations) {
      const rows = Array.isArray(data) ? data : mapParticipations(data);
      const us = rows.find((r: any) => r.marketplaceId === 'ATVPDKIKX0DER');
      await this.prisma.commerceAccount.updateMany({
        where: { workspaceId, provider: 'amazon' },
        data: { defaultMarketplaceCode: us ? 'AMAZON_US' : undefined, status: 'CONNECTED' },
      });
      return rows.length;
    }
    if (capability === STORE_CAPABILITIES.listingsSearch) {
      const listings = Array.isArray(data) ? data : mapListingsSearch(data);
      const marketplace = await this.prisma.marketplace.findUnique({ where: { code: 'AMAZON_US' } });
      if (!marketplace) return 0;
      for (const listing of listings) {
        if (!listing.sellerSku) continue;
        let product = await this.prisma.product.findFirst({
          where: { workspaceId, name: listing.title || listing.sellerSku },
        });
        if (!product) {
          product = await this.prisma.product.create({
            data: {
              workspaceId,
              marketplaceId: marketplace.id,
              name: listing.title || listing.sellerSku,
              brand: 'Amazon',
              category: 'Imported',
              status: 'ACTIVE',
            },
          });
        }
        await this.prisma.sku.upsert({
          where: { workspaceId_skuCode: { workspaceId, skuCode: listing.sellerSku } },
          create: {
            workspaceId,
            productId: product.id,
            skuCode: listing.sellerSku,
            amazonSellerSku: listing.sellerSku,
            asin: listing.asin,
            variantName: listing.title || listing.sellerSku,
            sellingPrice: listing.price ?? 0,
            status: 'ACTIVE',
          },
          update: {
            asin: listing.asin,
            amazonSellerSku: listing.sellerSku,
            sellingPrice: listing.price ?? undefined,
          },
        });
      }
      return listings.length;
    }
    if (capability === STORE_CAPABILITIES.ordersSearch) {
      const orders = Array.isArray(data) ? data : mapOrders(data);
      const marketplace = await this.prisma.marketplace.findUnique({ where: { code: 'AMAZON_US' } });
      if (!marketplace) return 0;
      let count = 0;
      for (const order of orders) {
        if (!order.amazonOrderId) continue;
        const existing = await this.prisma.order.findFirst({
          where: {
            workspaceId,
            sourceAccountId: accountId,
            externalOrderId: order.amazonOrderId,
          },
        });
        if (existing) {
          count += 1;
          continue;
        }
        const items = [];
        for (const item of order.items || []) {
          if (!item.sellerSku) continue;
          const sku = await this.prisma.sku.findUnique({
            where: { workspaceId_skuCode: { workspaceId, skuCode: item.sellerSku } },
          });
          if (!sku) continue;
          items.push({
            workspaceId,
            skuId: sku.id,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice ?? sku.sellingPrice,
          });
        }
        if (items.length === 0) continue;
        await this.prisma.order.create({
          data: {
            workspaceId,
            marketplaceId: marketplace.id,
            orderNumber: order.amazonOrderId,
            externalOrderId: order.amazonOrderId,
            sourceProvider: 'amazon',
            sourceAccountId: accountId,
            status: 'SHIPPED',
            totalAmount: order.totalAmount ?? 0,
            currencyCode: order.currencyCode || 'USD',
            orderedAt: new Date(order.purchaseDate || Date.now()),
            items: { create: items },
          },
        });
        count += 1;
      }
      return count;
    }
    if (capability === STORE_CAPABILITIES.inventorySummaries) {
      const rows = Array.isArray(data) ? data : mapInventorySummaries(data);
      let count = 0;
      for (const row of rows) {
        const sku = await this.prisma.sku.findFirst({
          where: this.skuMatchWhere(workspaceId, row.sellerSku, row.asin),
        });
        if (!sku) continue;
        await this.prisma.inventoryBalance.upsert({
          where: {
            workspaceId_skuId_warehouseType: { workspaceId, skuId: sku.id, warehouseType: 'FBA' },
          },
          create: {
            workspaceId,
            skuId: sku.id,
            warehouseType: 'FBA',
            fulfillableQuantity: row.fulfillableQuantity,
            reservedQuantity: row.reservedQuantity,
            inboundQuantity: row.inboundQuantity,
            unfulfillableQuantity: row.unfulfillableQuantity,
            sourceUpdatedAt: new Date(row.observedAt),
          },
          update: {
            fulfillableQuantity: row.fulfillableQuantity,
            reservedQuantity: row.reservedQuantity,
            inboundQuantity: row.inboundQuantity,
            unfulfillableQuantity: row.unfulfillableQuantity,
            sourceUpdatedAt: new Date(row.observedAt),
          },
        });
        count += 1;
      }
      return count;
    }
    if (capability === STORE_CAPABILITIES.financesTransactions) {
      const events = Array.isArray(data) ? data : mapFinances(data);
      return events.length;
    }
    return 0;
  }
}
