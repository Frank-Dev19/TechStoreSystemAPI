import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../common/utils/jwt-payload.type';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(private readonly cfg: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            // ✅ garantiza string (usa getOrThrow si tienes Nest 10; si no, fallback)
            secretOrKey:
                (cfg.get as any)?.call(cfg, 'JWT_ACCESS_SECRET') ||
                cfg.get<string>('JWT_ACCESS_SECRET') ||
                'dev_access_secret',
            ignoreExpiration: false,
        });
    }

    validate(payload: JwtPayload) {
        return payload;
    }
}
