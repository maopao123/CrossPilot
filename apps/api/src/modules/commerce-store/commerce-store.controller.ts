import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { CommerceStoreService } from './commerce-store.service.js';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SkipWorkspace } from '../../common/decorators/skip-workspace.decorator.js';
import { JwtPayload } from '@crosspilot/shared';

@Controller('commerce')
export class CommerceStoreController {
  constructor(private readonly store: CommerceStoreService) {}

  @Get('accounts')
  listAccounts(@CurrentWorkspace() workspaceId: string) {
    return this.store.listAccounts(workspaceId);
  }

  @Post('amazon/oauth/start')
  startOAuth(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { region?: 'NA' | 'EU' | 'FE' },
  ) {
    return this.store.startAmazonOAuth(workspaceId, user.sub, body?.region || 'NA');
  }

  @Public()
  @SkipWorkspace()
  @Get('amazon/oauth/callback')
  handleCallback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('spapi_oauth_code') spapiOauthCode?: string,
    @Query('selling_partner_id') sellingPartnerId?: string,
  ) {
    return this.store.handleAmazonOAuthCallback({
      code,
      state,
      spapi_oauth_code: spapiOauthCode,
      selling_partner_id: sellingPartnerId,
    });
  }

  @Post('amazon/sync')
  sync(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: { workspaceMember?: { role?: string } },
    @Body() body: { capability?: string; useMock?: boolean },
  ) {
    const role = req.workspaceMember?.role || user.role || 'OPERATOR';
    return this.store.sync(workspaceId, role, body || {});
  }

  @Get('amazon/sync-runs')
  listRuns(@CurrentWorkspace() workspaceId: string) {
    return this.store.listSyncRuns(workspaceId);
  }
}
