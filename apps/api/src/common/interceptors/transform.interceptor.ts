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
    const requestId =
      (request.headers['x-request-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return next.handle().pipe(
      map((response) => {
        // If response already matches standard structure, return as-is
        if (
          response &&
          typeof response === 'object' &&
          'data' in response &&
          'requestId' in response
        ) {
          return response;
        }

        // If response contains data and meta explicitly
        if (response && typeof response === 'object' && 'data' in response) {
          return {
            data: response.data,
            meta: response.meta || {},
            requestId,
          };
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
