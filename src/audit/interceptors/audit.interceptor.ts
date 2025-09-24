// src/audit/interceptors/audit.interceptor.ts
import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
    constructor(private readonly audit: AuditService) { }

    intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
        // ojo: es switchToHttp() (camelCase)
        const http = ctx.switchToHttp();
        const req = http.getRequest<Request>();
        const res = http.getResponse<Response>();

        const started = Date.now();
        const userId = (req as any)?.user?.sub ?? null;

        const meta = {
            method: req.method,
            path: req.route?.path ?? req.url,
            ip: (req.headers['x-forwarded-for'] as string) || req.ip,
            ua: (req.headers['user-agent'] as string) ?? null,
        };

        const before = {
            params: req.params,
            query: req.query,
            body: req.body,
        };

        return next.handle().pipe(
            tap({
                next: (result) => {
                    this.audit.log({
                        userId,
                        action: `${meta.method} ${meta.path}`,
                        status: res?.statusCode ?? 200,
                        durationMs: Date.now() - started,
                        meta,
                        before,
                        after: result,
                    });
                },
                error: (err) => {
                    this.audit.log({
                        userId,
                        action: `${meta.method} ${meta.path}`,
                        status: (err?.status ?? err?.statusCode ?? 500) as number,
                        durationMs: Date.now() - started,
                        meta,
                        before,
                        after: { error: true, message: err?.message },
                    });
                },
            }),
        );
    }
}
