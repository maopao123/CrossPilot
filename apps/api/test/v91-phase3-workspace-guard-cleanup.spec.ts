import { ForbiddenException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator.js';
import { SKIP_WORKSPACE_KEY } from '../src/common/decorators/skip-workspace.decorator.js';
import { WorkspaceGuard } from '../src/common/guards/workspace.guard.js';
import { ErrorCodes } from '@crosspilot/shared';

const srcRoot = path.resolve(__dirname, '..', 'src');

const duplicateGuardControllers = [
  'modules/inventory/inventory.controller.ts',
  'modules/supplier/supplier.controller.ts',
  'modules/product/product.controller.ts',
  'modules/profit/profit.controller.ts',
  'modules/order/order.controller.ts',
  'modules/purchase/purchase.controller.ts',
];

function workspaceGuardContext(overrides: {
  public?: boolean;
  skipWorkspace?: boolean;
  headers?: Record<string, string>;
  user?: { sub: string; workspaceId?: string };
}) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return !!overrides.public;
      if (key === SKIP_WORKSPACE_KEY) return !!overrides.skipWorkspace;
      return false;
    }),
  };
  const prisma = {
    workspaceMember: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const guard = new WorkspaceGuard(prisma as any, reflector as any);
  const request: any = {
    user: overrides.user || { sub: 'user-a' },
    headers: overrides.headers || {},
    params: {},
    query: {},
    body: {},
  };
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { guard, ctx, prisma, request };
}

describe('V91-028 duplicate WorkspaceGuard cleanup', () => {
  it('keeps WorkspaceGuard as a global APP_GUARD', () => {
    const src = fs.readFileSync(path.join(srcRoot, 'app.module.ts'), 'utf8');
    expect(src).toMatch(/provide:\s*APP_GUARD[\s\S]*useClass:\s*WorkspaceGuard/);
  });

  it('does not re-attach @UseGuards(WorkspaceGuard) on commerce controllers', () => {
    for (const rel of duplicateGuardControllers) {
      const src = fs.readFileSync(path.join(srcRoot, rel), 'utf8');
      expect(src).not.toMatch(/@UseGuards\(\s*WorkspaceGuard\s*\)/);
    }
  });

  it('still returns 403 WORKSPACE_ACCESS_DENIED when x-workspace-id is missing', async () => {
    const { guard, ctx } = workspaceGuardContext({});
    await expect(guard.canActivate(ctx as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('still returns 403 WORKSPACE_ACCESS_DENIED for a foreign workspace', async () => {
    const { guard, ctx, prisma } = workspaceGuardContext({
      headers: { 'x-workspace-id': 'ws-b' },
      user: { sub: 'user-a', workspaceId: 'ws-a' },
    });
    prisma.workspaceMember.findUnique.mockResolvedValue(null);
    try {
      await guard.canActivate(ctx as any);
      throw new Error('expected ForbiddenException');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as any;
      expect(body.code).toBe(ErrorCodes.WORKSPACE_ACCESS_DENIED);
    }
  });

  it('still allows @Public and @SkipWorkspace without a membership lookup', async () => {
    const pub = workspaceGuardContext({ public: true });
    await expect(pub.guard.canActivate(pub.ctx as any)).resolves.toBe(true);
    expect(pub.prisma.workspaceMember.findUnique).not.toHaveBeenCalled();

    const skip = workspaceGuardContext({ skipWorkspace: true });
    await expect(skip.guard.canActivate(skip.ctx as any)).resolves.toBe(true);
    expect(skip.prisma.workspaceMember.findUnique).not.toHaveBeenCalled();
  });
});
