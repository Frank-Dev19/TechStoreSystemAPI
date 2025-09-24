import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtPayload } from '../../common/utils/jwt-payload.type';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
    private readonly cookieName: string;

    constructor(private readonly cfg: ConfigService) {
        const cookieName =
            (cfg.get as any)?.call(cfg, 'COOKIE_NAME') ||
            cfg.get<string>('COOKIE_NAME') ||
            '__Host-rt';

        const cookieExtractor = (req: Request): string | null =>
            (req?.cookies?.[cookieName] as string | undefined) ?? null;

        super({
            jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]) as any, // TS muy estricto → 'as any'
            // ✅ garantiza string (no puede ser undefined)
            secretOrKey:
                (cfg.get as any)?.call(cfg, 'JWT_REFRESH_SECRET') ||
                cfg.get<string>('JWT_REFRESH_SECRET') ||
                'dev_refresh_secret',
            ignoreExpiration: false,
        });

        this.cookieName = cookieName;
    }

    validate(payload: JwtPayload) {
        return payload;
    }
}
