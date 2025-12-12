// Rutas que NO quieres auditar (ajústalas a tu app)
export const EXCLUDE_PREFIXES: string[] = [
    '/audit',        // tus endpoints de auditoría
    '/health',       // health checks
    '/docs', '/swagger',
    '/favicon.ico',
    '/assets', '/static',
];
