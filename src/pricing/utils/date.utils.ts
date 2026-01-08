// src/pricing/utils/date.utils.ts
export class DateUtils {
    /**
     * Convierte una fecha al inicio del día en UTC
     * Útil para comparaciones de "desde"
     */
    static toUTCMidnight(date: Date): Date {
        return new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            0, 0, 0, 0
        ));
    }

    /**
     * Convierte una fecha al final del día en UTC
     * Útil para comparaciones de "hasta"
     */
    static toUTCEndOfDay(date: Date): Date {
        return new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            23, 59, 59, 999
        ));
    }

    /**
     * Convierte string YYYY-MM-DD a Date UTC al final del día
     */
    static parseDateStringToUTC(dateString: string): Date {
        const parts = dateString.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);

        // Crear como final del día en UTC
        return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    }
}