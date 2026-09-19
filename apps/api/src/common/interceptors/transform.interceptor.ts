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
import { ensureRequestId, type RequestLike } from '../request-context.js';

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
      url.includes('/generate/stream') ||
      url.endsWith('/stream') ||
      url.includes('/stream?');
    const isMetrics = url.includes('/metrics');

    if (isSse || isMetrics) {
      return next.handle();
    }

    const requestId = ensureRequestId(request as RequestLike);

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
