import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse, ErrorCodes } from '@crosspilot/shared';
import { ZodError } from 'zod';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCodes.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';
    let details: Record<string, unknown> | undefined = undefined;

    if (exception instanceof ZodError || (exception as any)?.name === 'ZodError') {
      status = HttpStatus.BAD_REQUEST;
      code = ErrorCodes.VALIDATION_ERROR;
      message = 'Validation failed';
      details = {
        validationErrors: (exception as any).issues?.map((i: any) => ({
          path: i.path?.join('.'),
          message: i.message,
          code: i.code,
        })) || (exception as any).errors,
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, any>;
        message = obj.message || obj.error || message;
        code = obj.code || this.mapStatusToErrorCode(status);
        if (obj.details) {
          details = obj.details;
        } else if (Array.isArray(obj.message)) {
          // Nest validation pipe error messages
          details = { validationErrors: obj.message };
          message = 'Validation failed';
          code = ErrorCodes.VALIDATION_ERROR;
        }
      }
    } else if (exception instanceof Error) {
      const errCode = (exception as any)?.code;
      if (errCode === 'CHECKPOINT_VERSION_CONFLICT') {
        status = HttpStatus.CONFLICT;
        code = 'CHECKPOINT_VERSION_CONFLICT';
        message = exception.message;
      } else if (errCode === 'WORKFLOW_NOT_FOUND') {
        status = HttpStatus.NOT_FOUND;
        code = 'WORKFLOW_NOT_FOUND';
        message = exception.message;
      } else if (errCode === 'INVALID_ACTION_STATE') {
        status = HttpStatus.CONFLICT;
        code = 'INVALID_ACTION_STATE';
        message = exception.message;
      } else if (errCode === 'PERSISTENCE_UNAVAILABLE') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        code = 'PERSISTENCE_UNAVAILABLE';
        message = exception.message;
      } else if (errCode === 'WORKSPACE_ACCESS_DENIED') {
        status = HttpStatus.FORBIDDEN;
        code = 'WORKSPACE_ACCESS_DENIED';
        message = exception.message;
      } else if (errCode === 'AUTH_FORBIDDEN') {
        status = HttpStatus.FORBIDDEN;
        code = 'AUTH_FORBIDDEN';
        message = exception.message;
      } else if (process.env.NODE_ENV === 'production') {
        message = 'An unexpected internal error occurred';
      } else {
        message = exception.message;
      }
    }

    const payload: ApiErrorResponse = {
      error: {
        code,
        message: Array.isArray(message) ? message.join(', ') : message,
        details,
      },
      requestId,
    };

    response.status(status).json(payload);
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.AUTH_UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.AUTH_FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.RESOURCE_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONFLICT_ERROR;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCodes.RATE_LIMIT_EXCEEDED;
      default:
        return ErrorCodes.INTERNAL_SERVER_ERROR;
    }
  }
}
