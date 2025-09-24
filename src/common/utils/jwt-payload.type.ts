export type JwtPayload = {
    sub: number; // user id
    email?: string;
    roles?: Array<{ id: number; name: string; permissions?: Array<{ code: string }> }>;
    jti?: string; // id de refresh (solo en refresh)
    iat?: number;
    exp?: number;
};
