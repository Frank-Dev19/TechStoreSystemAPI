import { Injectable } from '@nestjs/common';

@Injectable()
export class LockService {
    private isLocked = false;
    private reason: string | null = null;

    getState() { return { isLocked: this.isLocked, reason: this.reason }; }
    lock(reason?: string) { this.isLocked = true; this.reason = reason ?? 'Conteo cíclico'; return this.getState(); }
    unlock() { this.isLocked = false; this.reason = null; return this.getState(); }
}
