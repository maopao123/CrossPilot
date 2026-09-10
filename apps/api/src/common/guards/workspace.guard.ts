import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service.js';
import { ErrorCodes } from '@crosspilot/shared';

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      return false;
    }

    const workspaceId =
      request.headers['x-workspace-id'] ||
      request.params.workspaceId ||
      request.query.workspaceId ||
      user.workspaceId;

    if (!workspaceId) {
      // If no specific workspace is requested, allow through if user is authenticated
      return true;
    }

    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: String(workspaceId),
          userId: user.sub,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException({
        code: ErrorCodes.WORKSPACE_ACCESS_DENIED,
        message: 'You do not have access to this workspace',
      });
    }

    request.workspaceId = workspaceId;
    request.workspaceMember = member;
    return true;
  }
}
