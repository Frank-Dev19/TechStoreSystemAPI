export function parseDateStart(input?: string | null): Date | null {
    if (!input) return null;

    // Si viene con hora (ISO), respetar
    if (input.includes('T')) return new Date(input);

    // Si viene solo YYYY-MM-DD => inicio del día LOCAL
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function parseDateEnd(input?: string | null): Date | null {
    if (!input) return null;

    if (input.includes('T')) return new Date(input);

    // YYYY-MM-DD => fin del día LOCAL
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
}
