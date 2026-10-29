import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AppJsonLoggerService } from './app-json-logger.service';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly jsonLogger: AppJsonLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    const startTime = Date.now();
    const userId = (req as any).user?.id || (req as any).userId;
    const url = req.originalUrl || req.url;
    const method = req.method;

    // Log Incoming Backend Request
    this.jsonLogger.logIncomingRequest({
      method,
      url,
      ip: req.ip || req.socket?.remoteAddress,
      userId,
      userAgent: req.get('user-agent'),
      body: req.body,
      query: req.query,
    });

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - startTime;
        const statusCode = res.statusCode || 200;

        this.jsonLogger.logOutgoingResponse({
          method,
          url,
          statusCode,
          durationMs,
          userId: (req as any).user?.id || userId,
        });
      }),
      catchError((err) => {
        const durationMs = Date.now() - startTime;
        const statusCode =
          err instanceof HttpException
            ? err.getStatus()
            : (err as any).statusCode || HttpStatus.INTERNAL_SERVER_ERROR;

        this.jsonLogger.logOutgoingResponse({
          method,
          url,
          statusCode,
          durationMs,
          userId: (req as any).user?.id || userId,
        });

        // Write structured exception entry
        this.jsonLogger.writeEntry({
          level: 'ERROR',
          event: 'HTTP_EXCEPTION',
          context: 'HttpLoggingInterceptor',
          client: {
            userId: (req as any).user?.id || userId,
            ip: req.ip,
          },
          http: {
            method,
            url,
            statusCode,
            durationMs,
          },
          error: {
            message: err.message || 'Internal Server Error',
            stack: err.stack,
            code: (err as any).code,
          },
        });

        throw err;
      })
    );
  }
}
