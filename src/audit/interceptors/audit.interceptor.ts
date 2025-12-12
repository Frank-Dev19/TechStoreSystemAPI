// src/audit/interceptors/audit.interceptor.ts
import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../audit.service';
import { getRealIp } from '../utils/ip.util';
import { safeJson } from '../utils/masking.util';
import { EXCLUDE_PREFIXES } from '../audit.constants';

// 👇 importa el context
import { RequestContext } from 'src/common/request-context';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
    constructor(private readonly audit: AuditService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const http = context.switchToHttp();
        const req: any = http.getRequest();
        const res: any = http.getResponse();

        // usa originalUrl si existe (proxys)
        const url: string = (req.originalUrl ?? req.url ?? '') as string;

        // salta auditoría para prefijos excluidos y preflight OPTIONS
        if (req.method === 'OPTIONS' || EXCLUDE_PREFIXES.some((p) => url.startsWith(p))) {
            return next.handle();
        }

        const t0 = Date.now();
        const method = (req.method ?? null) as string | null;
        const path = (url ?? null) as string | null;

        const userId: number | null = req.user?.id ?? null;

        let requestId: string | null = (req.headers['x-request-id'] as string) || null;
        if (!requestId) {
            requestId = uuidv4();
            req.generatedRequestId = requestId;
            // res.setHeader?.('x-request-id', requestId); // opcional
        }

        const sessionId: string | null = req.session?.id ?? null;
        const ip = getRealIp(req);
        const userAgent = (req.headers['user-agent'] as string) || null;

        // BEFORE: params/query/body enmascarados
        const before = {
            params: safeJson(req.params),
            query: safeJson(req.query),
            body: safeJson(req.body),
        };

        // 👇 Parchea/actualiza el contexto del request
        RequestContext.patch({
            userId,
            actorEmail: req.user?.email ?? null,   // nuevo
            actorName: req.user?.name ?? null,    // nuevo
            requestId,
            method,
            path,
            ip,
            userAgent,
        });

        return next.handle().pipe(
            tap({
                next: (body) => {
                    const durationMs = Date.now() - t0;
                    const status = res.statusCode ?? 200;
                    const after = safeJson(body);

                    this.audit
                        .http({
                            userId,
                            method,
                            path,
                            status,
                            durationMs,
                            ip,
                            userAgent,
                            requestId,
                            sessionId,
                            before,
                            after,
                        })
                        .catch(() => void 0);
                },
                error: () => {
                    const durationMs = Date.now() - t0;
                    const status = res.statusCode ?? 500;

                    this.audit
                        .http({
                            userId,
                            method,
                            path,
                            status,
                            durationMs,
                            ip,
                            userAgent,
                            requestId,
                            sessionId,
                            before,
                            after: { error: true },
                        })
                        .catch(() => void 0);
                },
            }),
        );
    }
}
