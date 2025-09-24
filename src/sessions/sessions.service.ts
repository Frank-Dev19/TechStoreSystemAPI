import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Session } from './entities/session.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class SessionsService {
    constructor(@InjectRepository(Session) private repo: Repository<Session>) { }

    async createShell(user: User, meta: { ua?: string; ip?: string }, rotatedFrom?: string | null) {
        const s = this.repo.create({
            user,
            tokenHash: '',                            // luego lo seteamoss
            expiresAt: new Date(0),                   // luego lo seteamoss
            rotatedFrom: rotatedFrom ?? null,
            userAgent: meta.ua ?? null,
            ip: meta.ip ?? null,
        });
        return this.repo.save(s); // devuelve Session con id (uuid) generado por DB
    }

    // 2) Adjunta el refresh real a la sesión creada
    async attachToken(sessionId: string, refreshToken: string, expiresAt: Date) {
        const tokenHash = await bcrypt.hash(refreshToken, 10);
        await this.repo.update({ id: sessionId }, { tokenHash, expiresAt });
    }


    async create(user: User, refreshToken: string, expiresAt: Date, meta: { ua?: string; ip?: string }, rotatedFrom?: string) {
        const s = new Session();
        s.user = user;
        s.tokenHash = await bcrypt.hash(refreshToken, 10);
        s.expiresAt = expiresAt;
        s.rotatedFrom = rotatedFrom ?? null;
        s.userAgent = meta.ua ?? null;
        s.ip = meta.ip ?? null;
        return this.repo.save(s);
    }

    findById(id: string) {
        return this.repo.findOne({ where: { id } });
    }

    async markRevoked(id: string) {
        await this.repo.update({ id }, { revokedAt: new Date() });
    }

    async markRotated(id: string) {
        await this.repo.update({ id }, { rotatedAt: new Date() });
    }

    async isMatching(session: Session, presentedToken: string) {
        return bcrypt.compare(presentedToken, session.tokenHash);
    }

    async revokeChain(rotatedFrom: string) {
        // revoca la cadena hacia atrás
        const toRevoke = await this.repo.find({ where: { id: rotatedFrom } });
        for (const s of toRevoke) await this.markRevoked(s.id);
    }
}
