import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { RequestContextService, RequestStore } from './request-context.service';

@Injectable()
export class TracingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // 1. Capture client trace ID or generate a cryptographically unique one
    const incomingTrace = (req.headers['x-trace-id'] || req.headers['x-request-id']) as string | undefined;
    const traceId =
      incomingTrace && /^[a-zA-Z0-9_\-:]{6,64}$/.test(incomingTrace)
        ? incomingTrace
        : `trc_${crypto.randomBytes(6).toString('hex')}`;

    // 2. Attach traceId to outgoing response headers so frontend/extension can correlate
    res.setHeader('X-Trace-Id', traceId);

    // 3. Resolve user identity if present on request (e.g., from prior cookie/jwt inspection)
    const userId = (req as any).user?.id || (req as any).userId;

    const store: RequestStore = {
      traceId,
      userId,
      startTime: Date.now(),
      method: req.method,
      url: req.originalUrl || req.url,
    };

    // 4. Wrap the entire request execution inside AsyncLocalStorage context
    RequestContextService.run(store, () => {
      next();
    });
  }
}
