import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCodes } from '@crosspilot/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class ViewerWriteGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const method = String(request.method || 'GET').toUpperCase();
    if (READ_METHODS.has(method)) {
      return true;
    }

    const role =
      request.workspaceMember?.role || request.user?.role || request.user?.workspaceRole;

    if (role === 'VIEWER') {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_FORBIDDEN,
        message: 'Viewer role cannot perform write operations',
      });
    }

    return true;
  }
}
