import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContext } from './request-context';
import { getRealIp } from '../audit/utils/ip.util';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & any, _res: Response, next: NextFunction) {
    // Semilla inicial (userId puede no estar aún; lo parcheamos luego en el interceptor)
    RequestContext.run(
      {
        requestId: (req.generatedRequestId ?? req.headers['x-request-id'] ?? null) as string | null,
        userId: req.user?.id ?? null,
        actorEmail: req.user?.email ?? null,   // nuevo
        actorName: req.user?.name ?? null,    // nuevo
        ip: getRealIp(req),
        userAgent: (req.headers['user-agent'] as string) ?? null,
        method: (req.method ?? null) as string | null,
        path: (req.originalUrl ?? req.url ?? null) as string | null,
      },
      next,
    );
  }
}
