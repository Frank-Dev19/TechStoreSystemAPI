// src/audit/audit.service.ts
import { Injectable, Logger } from '@nestjs/common';

type AuditEntry = {
    userId: number | null;
    action: string;
    status: number;
    durationMs: number;
    meta?: any;
    before?: any;
    after?: any;
};

@Injectable()
export class AuditService {
    private readonly logg = new Logger('Audit');
    log(entry: AuditEntry) {
        // aquí luego lo guardas en DB
        this.logg.log(JSON.stringify(entry));
    }
}
