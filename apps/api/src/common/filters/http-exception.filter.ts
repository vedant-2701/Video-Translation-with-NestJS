import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * GlobalHttpExceptionFilter
 *
 * Catches all HttpExceptions (thrown by guards, pipes, controllers, services)
 * and returns a consistent JSON error shape.
 *
 * Also catches unexpected errors (non-HttpException) and returns 500
 * without leaking internal details in production.
 */
@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) ?? exception.message;
        error = (res.error as string) ?? exception.name;
      } else {
        message = exception.message;
        error = exception.name;
      }
    } else {
      // Unexpected error — log full details, hide from client in production
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'InternalServerError';
      message =
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : (exception as Error)?.message ?? 'Unknown error';

      this.logger.error(
        `Unhandled exception: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    const body: ErrorResponse = {
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    this.logger.warn(`[${statusCode}] ${request.method} ${request.url} — ${JSON.stringify(message)}`);

    response.status(statusCode).json(body);
  }
}