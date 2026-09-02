import { BadRequestException } from '@nestjs/common';
import { WarrantyDurationUnit } from '../common/enums/warranty-duration-unit.enum';

export function addWarrantyDuration(
  startsAt: Date,
  duration: number,
  unit: WarrantyDurationUnit,
): Date {
  if (!Number.isInteger(duration) || duration <= 0) {
    throw new BadRequestException('La duración de garantía debe ser un entero positivo');
  }

  const result = new Date(startsAt.getTime());
  if (unit === WarrantyDurationUnit.DAY) {
    result.setUTCDate(result.getUTCDate() + duration);
    return result;
  }

  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  if (unit === WarrantyDurationUnit.MONTH) {
    result.setUTCMonth(result.getUTCMonth() + duration);
  } else if (unit === WarrantyDurationUnit.YEAR) {
    result.setUTCFullYear(result.getUTCFullYear() + duration);
  } else {
    throw new BadRequestException('Unidad de duración de garantía no válida');
  }

  const year = result.getUTCFullYear();
  const month = result.getUTCMonth();
  const finalDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, finalDay));
  return result;
}
