export type JwtPayload = {
    sub: number;           // user id
    email: string;
    roles: { id: number; name: string; permissions: { code: string }[] }[];
    jti?: string;          // para refresh
};
