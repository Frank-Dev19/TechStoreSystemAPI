import { BadRequestException } from '@nestjs/common';

export type CustomerConceptLine = {
  type: string;
  quantity: number | string;
  catalogNameSnapshot?: string;
  productId?: number | null;
  serviceId?: number | null;
  netAmount?: number;
};

/** Derive the public concept exclusively from immutable commercial snapshots. */
export function buildAutomaticCustomerSummary(lines: CustomerConceptLine[]): string {
  const services = new Set<string>();
  const products = new Map<string, { name: string; quantity: number }>();
  for (const line of lines) {
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const name = String(line.catalogNameSnapshot ?? '').replace(/\s+/g, ' ').trim();
    if (line.type === 'SERVICE') {
      services.add(!name || /^Servicio #\d+$/i.test(name) ? 'Servicio técnico' : name);
    } else if (line.type === 'PRODUCT') {
      const label = name || 'Producto';
      const key = JSON.stringify([line.productId ?? null, label]);
      const current = products.get(key);
      products.set(key, { name: label, quantity: (current?.quantity ?? 0) + quantity });
    }
  }
  return [
    ...services,
    ...Array.from(products.values(), ({ name, quantity }) => `${Number(quantity.toFixed(2))} ${name}`),
  ].join(' + ') || 'Servicio técnico';
}

export function normalizeCustomerSummary(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException('El resumen para el cliente debe ser un texto');
  const summary = value.replace(/\s+/g, ' ').trim();
  if (summary.length > 500) throw new BadRequestException('El resumen para el cliente debe tener como máximo 500 caracteres');
  return summary || null;
}

export function requireCustomerSummary(value: unknown): string {
  const summary = normalizeCustomerSummary(value);
  if (!summary) throw new BadRequestException('Completa el resumen para el cliente antes de emitir o aceptar la cotización');
  return summary;
}
