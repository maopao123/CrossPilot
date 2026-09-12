import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { extractLogContext } from '../request-context.js';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();
    const started = Date.now();
    const ctx = extractLogContext(request);

    return next.handle().pipe(
      finalize(() => {
        this.logger.log(
          JSON.stringify({
            ...ctx,
            method: request.method,
            path: request.originalUrl || request.url || request.path,
            statusCode: response?.statusCode,
            durationMs: Date.now() - started,
          }),
        );
      }),
    );
  }
}
