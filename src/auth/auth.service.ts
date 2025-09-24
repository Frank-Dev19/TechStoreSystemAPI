import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SessionsService } from '../sessions/sessions.service';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dtos/login.dto';
import type { Response, Request } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {

    private readonly cookieName: string;
    constructor(
        private users: UsersService,
        private jwt: JwtService,
        private sessions: SessionsService,
        private cfg: ConfigService,
    ) {
        this.cookieName = this.cfg.get<string>('COOKIE_NAME') || 'rt';
    }

    private signAccess(user: any) {
        const payload = {
            sub: user.id,
            email: user.email,
            roles: user.roles?.map((r: any) => ({
                id: r.id, name: r.name,
                permissions: (r.permissions ?? []).map((p: any) => ({ code: p.code })),
            })) ?? [],
        };
        return this.jwt.sign(payload, {
            secret: this.cfg.get<string>('JWT_ACCESS_SECRET'),
            expiresIn: this.cfg.get<string>('JWT_ACCESS_TTL') || '10m',
        });
    }

    private signRefresh(userId: number, jti: string) {
        return this.jwt.sign(
            { sub: userId, jti },
            { secret: this.cfg.get<string>('JWT_REFRESH_SECRET'), expiresIn: this.cfg.get<string>('JWT_REFRESH_TTL') || '30d' },
        );
    }

    private setRefreshCookie(res: Response, token: string) {
        res.cookie(this.cookieName, token, {
            httpOnly: true,
            secure: false,                 // en dev con http puede fallar; si es así, pon false SOLO en local
            sameSite: (this.cfg.get<string>('COOKIE_SAMESITE') as any) || 'lax',
            path: '/auth/refresh',
            maxAge: 1000 * 60 * 60 * 24 * 30, // 30 días
        });
    }

    async login(dto: LoginDto, req: Request, res: Response) {
        const user = await this.users.validateCredentials(dto.email, dto.password);
        if (!user) throw new UnauthorizedException('Credenciales inválidas');

        const accessToken = this.signAccess(user);


        // 1) crea shell para obtener id (uuid) -> será el jti del token
        const shell = await this.sessions.createShell(
            user,
            { ua: req.headers['user-agent'] as string, ip: (req.headers['x-forwarded-for'] as string) || req.ip },
            null,
        );

        //const jti = randomUUID();
        const refreshToken = this.signRefresh(user.id, shell.id);
        const expSec = this.jwt.decode(refreshToken) as any;
        const expiresAt = new Date(expSec?.exp ? expSec.exp * 1000 : Date.now() + 30 * 86400000);

        await this.sessions.attachToken(shell.id, refreshToken, expiresAt);
        // await this.sessions.create(user, refreshToken, expiresAt, {
        //     ua: req.headers['user-agent'] as string,
        //     ip: (req.headers['x-forwarded-for'] as string) || req.ip,
        // });

        this.setRefreshCookie(res, refreshToken);
        //const DEV = this.cfg.get<string>('NODE_ENV') !== 'production';
        //return DEV ? { accessToken, refreshToken } : { accessToken };
        return { accessToken };
    }

    async refresh(req: Request, res: Response) {
        const presented = req.cookies?.[this.cookieName];
        if (!presented) throw new UnauthorizedException('No refresh token');

        let payload: any;
        try {
            payload = this.jwt.verify(presented, { secret: this.cfg.get<string>('JWT_REFRESH_SECRET') });
        } catch {
            throw new UnauthorizedException('Refresh inválido');
        }

        const session = await this.sessions.findById(payload.jti);
        if (!session || session.revokedAt) throw new UnauthorizedException('Refresh no válido');
        if (session.expiresAt < new Date()) throw new UnauthorizedException('Refresh expirado');

        const ok = await this.sessions.isMatching(session, presented);
        if (!ok) {
            await this.sessions.markRevoked(session.id);
            throw new ForbiddenException('Detección de reuse, sesión revocada');
        }

        // Rotación
        await this.sessions.markRotated(session.id);

        // 1) nueva shell encadenada (rotatedFrom = sesión anterior)
        const shell = await this.sessions.createShell(
            session.user,
            { ua: req.headers['user-agent'] as string, ip: (req.headers['x-forwarded-for'] as string) || req.ip },
            session.id,
        );

        //const newJti = randomUUID();
        const newRefresh = this.signRefresh(session.user.id, shell.id);
        const dec: any = this.jwt.decode(newRefresh);
        const newExpiresAt = new Date(dec?.exp ? dec.exp * 1000 : Date.now() + 30 * 86400000);

        // await this.sessions.create(
        //     session.user,
        //     newRefresh,
        //     newExpiresAt,
        //     { ua: req.headers['user-agent'] as string, ip: (req.headers['x-forwarded-for'] as string) || req.ip },
        //     session.id,
        // );

        // 3) adjuntar token a la shell
        await this.sessions.attachToken(shell.id, newRefresh, newExpiresAt);

        const accessToken = this.signAccess(session.user);
        this.setRefreshCookie(res, newRefresh);
        return { accessToken };
    }

    async logout(req: Request, res: Response) {
        const presented = req.cookies?.[this.cookieName];
        if (presented) {
            try {
                const payload: any = this.jwt.verify(presented, { secret: this.cfg.get<string>('JWT_REFRESH_SECRET') });
                await this.sessions.markRevoked(payload.jti);
            } catch { /* ignore */ }
        }
        res.clearCookie(this.cookieName, { path: '/auth/refresh' });
        return { ok: true };
    }
}
