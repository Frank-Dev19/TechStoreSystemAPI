import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SessionsService } from '../sessions/sessions.service';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dtos/login.dto';
import type { Response, Request } from 'express';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { MailerService } from 'src/mailer/mailer.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull } from 'typeorm';

@Injectable()
export class AuthService {

    private readonly cookieName: string;
    constructor(
        private users: UsersService,
        private jwt: JwtService,
        private sessions: SessionsService,
        private cfg: ConfigService,
        @InjectRepository(PasswordResetToken) private prRepo: Repository<PasswordResetToken>,
        private mailer: MailerService,
    ) {
        this.cookieName = this.cfg.get<string>('COOKIE_NAME') || 'rt';
    }

    private signAccess(user: any) {
        const payload = {
            sub: user.id,
            email: user.email,
            roles: user.roles?.map((r: any) => ({
                id: r.id,
                name: r.name,
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
            secure: false,
            sameSite: (this.cfg.get<string>('COOKIE_SAMESITE') as any) || 'lax',
            path: '/auth/refresh',
            maxAge: 1000 * 60 * 60 * 24 * 30,
        });
        // Nota: en producción 'secure: true' y SameSite='strict' o 'lax' según tu front.
    }

    // ============ LOGIN / REFRESH / LOGOUT ============

    async login(dto: LoginDto, req: Request, res: Response) {
        const user = await this.users.validateCredentials(dto.email, dto.password);
        if (!user) throw new UnauthorizedException('Credenciales inválidas');

        const accessToken = this.signAccess(user);

        const shell = await this.sessions.createShell(
            user,
            { ua: req.headers['user-agent'] as string, ip: (req.headers['x-forwarded-for'] as string) || req.ip },
            null,
        );

        const refreshToken = this.signRefresh(user.id, shell.id);
        const expSec = this.jwt.decode(refreshToken) as any;
        const expiresAt = new Date(expSec?.exp ? expSec.exp * 1000 : Date.now() + 30 * 86400000);

        await this.sessions.attachToken(shell.id, refreshToken, expiresAt);
        this.setRefreshCookie(res, refreshToken);
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

        await this.sessions.markRotated(session.id);

        const shell = await this.sessions.createShell(
            session.user,
            { ua: req.headers['user-agent'] as string, ip: (req.headers['x-forwarded-for'] as string) || req.ip },
            session.id,
        );

        const newRefresh = this.signRefresh(session.user.id, shell.id);
        const dec: any = this.jwt.decode(newRefresh);
        const newExpiresAt = new Date(dec?.exp ? dec.exp * 1000 : Date.now() + 30 * 86400000);

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

    // ============ FORGOT / RESET PASSWORD ============

    async forgotPassword(dto: ForgotPasswordDto, req: Request) {
        // Respuesta neutra SIEMPRE
        const neutral = { message: 'Si el correo existe, se enviarán instrucciones.' };

        const user = await this.users.findByEmail(dto.email);
        if (!user || !user.isActive) return neutral;

        // Generar token y guardar SOLO el hash
        const token = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(token).digest('hex');

        const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 min
        const pr = this.prRepo.create({
            user: { id: user.id } as any,
            tokenHash,
            expiresAt,
            usedAt: null,
            ip: (req.headers['x-forwarded-for'] as string) || req.ip,
            userAgent: req.headers['user-agent'] as string,
        });
        await this.prRepo.save(pr);

        const appUrl = this.cfg.get<string>('APP_PUBLIC_URL') || 'http://localhost:4200';
        const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}&uid=${user.id}`;

        await this.mailer.sendPasswordReset(user.email, link, user.name);

        return neutral;
    }

    async resetPassword(dto: ResetPasswordDto): Promise<{ ok: boolean }> {
        const tokenHash = createHash('sha256').update(dto.token).digest('hex');

        const record = await this.prRepo.findOne({
            where: {
                user: { id: dto.uid },     // ⬅️ relación
                tokenHash,
                usedAt: IsNull(),
                expiresAt: MoreThan(new Date()),
            },
            order: { createdAt: 'DESC' },
        });

        if (!record) throw new BadRequestException('Token inválido o expirado');

        await this.users.setPassword(dto.uid, dto.newPassword);
        record.usedAt = new Date();
        await this.prRepo.save(record);

        return { ok: true };
    }






    /** ✅ Verificación que usarás desde GET /auth/password/verify */
    async verifyReset(uid: number, token: string): Promise<{ ok: boolean }> {
        const tokenHash = createHash('sha256').update(token).digest('hex');

        const rec = await this.prRepo.findOne({
            where: {
                user: { id: uid },     // relación, no userId
                tokenHash,
                usedAt: IsNull(),      // ⬅️ en vez de null
                expiresAt: MoreThan(new Date()),
            },
            order: { createdAt: 'DESC' },
        });

        return { ok: !!rec };
    }

    /** Busca un token válido (no usado y no expirado) para ese user+token */
    private async findValidReset(userId: number, rawToken: string) {
        const tokenHash = this.hashToken(rawToken);
        const record = await this.prRepo.findOne({
            where: { userId, tokenHash },
            order: { createdAt: 'DESC' },
        });
        if (!record) return null;
        if (record.usedAt) return null;
        if (record.expiresAt < new Date()) return null;
        return record;
    }

    private hashToken(raw: string) {
        return createHash('sha256').update(raw).digest('hex');
    }
}
