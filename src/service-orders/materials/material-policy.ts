import { BadRequestException, ForbiddenException } from '@nestjs/common';

export function assertUsableSerial(serial: {
  status: string;
  condition: string;
}) {
  if (serial.status !== 'IN_STOCK' || serial.condition !== 'USABLE') {
    throw new BadRequestException('La serie no está disponible o utilizable');
  }
}

export function assertReviewRole(roles: { name?: string }[]) {
  if (!roles.some((role) => role.name === 'admin')) {
    throw new ForbiddenException('Solo admin puede resolver la revisión');
  }
}

export function assertReconciliationStage(technicalStatus: string) {
  if (technicalStatus !== 'EN_EJECUCION') {
    throw new BadRequestException(
      'El equipo debe estar En servicio para confirmar los materiales utilizados.',
    );
  }
}

export function assertMaterialDeliveryStage(technicalStatus: string) {
  if (technicalStatus !== 'EN_EJECUCION') {
    throw new BadRequestException(
      'El equipo debe estar En servicio para entregar materiales.',
    );
  }
}

export function assertMaterialMatch(
  expected: { productId: number | null; quantity: number }[],
  used: { productId: number | null; quantity: number }[],
) {
  const totals = (rows: typeof expected) => {
    const result = new Map<number, number>();
    for (const row of rows) {
      const id = Number(row.productId);
      const qty = Number(row.quantity);
      if (!id || !Number.isFinite(qty) || qty < 0)
        throw new BadRequestException('Material inválido');
      result.set(id, (result.get(id) ?? 0) + qty);
    }
    return result;
  };
  const a = totals(expected),
    b = totals(used);
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    if (Math.abs((a.get(id) ?? 0) - (b.get(id) ?? 0)) > 0.00001) {
      throw new BadRequestException(
        'Lo utilizado no coincide con la cotización vigente. Regularice la cotización antes de conciliar y vender.',
      );
    }
  }
}
