import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../modules/prisma/prisma.service.js';
import { ErrorCodes } from '@crosspilot/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SKIP_WORKSPACE_KEY } from '../decorators/skip-workspace.decorator.js';

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const skipWorkspace = this.reflector.getAllAndOverride<boolean>(
      SKIP_WORKSPACE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipWorkspace) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.sub) {
      return false;
    }

    let workspaceId =
      request.headers['x-workspace-id'] ||
      request.params?.workspaceId ||
      request.query?.workspaceId ||
      request.body?.workspaceId ||
      user.workspaceId;

    if (!workspaceId) {
      const firstMember = await this.prisma.workspaceMember.findFirst({
        where: { userId: user.sub },
      });
      if (firstMember) {
        workspaceId = firstMember.workspaceId;
      } else {
        throw new ForbiddenException({
          code: ErrorCodes.WORKSPACE_ACCESS_DENIED,
          message: 'User does not belong to any workspace.',
        });
      }
    }

    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: String(workspaceId),
          userId: user.sub,
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!member) {
      throw new ForbiddenException({
        code: ErrorCodes.WORKSPACE_ACCESS_DENIED,
        message: 'You do not have access to this workspace',
      });
    }

    request.workspaceId = member.workspaceId;
    request.workspaceMember = member;
    return true;
  }
}
