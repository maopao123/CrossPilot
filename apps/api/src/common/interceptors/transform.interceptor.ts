import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { ApiSuccessResponse } from '@crosspilot/shared';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiSuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const accept = String(request.headers['accept'] || '');
    const url = String(request.url || request.path || '');
    const isSse =
      accept.includes('text/event-stream') ||
      url.includes('/events') ||
      url.endsWith('/stream') ||
      url.includes('/stream?');

    if (isSse) {
      return next.handle();
    }

    const requestId =
      (request.headers['x-request-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return next.handle().pipe(
      map((response) => {
        if (
          response &&
          typeof response === 'object' &&
          'data' in response &&
          'requestId' in response
        ) {
          return response;
        }

        return {
          data: response,
          meta: {},
          requestId,
        };
      }),
    );
  }
}
