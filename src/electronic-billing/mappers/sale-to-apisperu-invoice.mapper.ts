import { BadRequestException } from '@nestjs/common';
import { Sale } from '../../sales/entities/sale.entity';
import { SaleItem } from '../../sales/entities/sale-item.entity';
import { DocumentType } from '../../sales/enums/document-type.enum';
import { mapDocumentTypeToSunatCode } from '../../sales/mappers/sunat-document-type.mapper';
import { mapClientToApisPeruPayload } from '../../clients/mappers/apisperu-client.mapper';
import { splitIncludedTax } from '../../sales/utils/included-tax.util';
import { ApisPeruCompanyPayload, ApisPeruInvoiceDetailPayload, ApisPeruInvoicePayload } from '../dto/apisperu-invoice.types';

const TAXABLE_IGV_AFFECTATION = '10';
const STANDARD_OPERATION = '0101';
const UBL_VERSION = '2.1';
const DEFAULT_CURRENCY = 'PEN';

export function mapSaleToApisPeruInvoicePayload(
  sale: Sale,
  company: ApisPeruCompanyPayload,
): ApisPeruInvoicePayload {
  assertSupportedDocumentType(sale.documentType);
  assertCompanyReady(company);
  assertClientReady(sale);
  assertSaleReady(sale);

  const taxRatePct = round(Number(sale.taxRate || 0) * 100);
  const details = (sale.items ?? []).map((item) => mapSaleItem(item, taxRatePct));

  return {
    ublVersion: UBL_VERSION,
    tipoOperacion: STANDARD_OPERATION,
    tipoDoc: mapDocumentTypeToSunatCode(sale.documentType),
    serie: sale.series,
    correlativo: normalizeCorrelative(sale.number),
    fechaEmision: toPeruIsoDate(sale.issueDate),
    fecVencimiento: sale.dueDate ? toPeruIsoDate(sale.dueDate) : null,
    formaPago: buildPaymentTerms(sale),
    tipoMoneda: DEFAULT_CURRENCY,
    client: mapClientToApisPeruPayload(sale.customer),
    company,
    mtoOperGravadas: round(Number(sale.subtotal || 0)),
    mtoIGV: round(Number(sale.taxAmount || 0)),
    valorVenta: round(Number(sale.subtotal || 0)),
    totalImpuestos: round(Number(sale.taxAmount || 0)),
    subTotal: round(Number(sale.total || 0)),
    mtoImpVenta: round(Number(sale.total || 0)),
    details,
    legends: [
      {
        code: '1000',
        value: buildAmountLegend(Number(sale.total || 0)),
      },
    ],
    observacion: sale.observations ?? null,
  };
}

function mapSaleItem(item: SaleItem, taxRatePct: number): ApisPeruInvoiceDetailPayload {
  const quantity = Number(item.quantity || 0);
  if (quantity <= 0) {
    throw new BadRequestException(`La linea ${item.id} no tiene una cantidad valida.`);
  }

  const grossLineTotal = round(Number(item.lineTotal || 0));
  const taxBreakdown = splitIncludedTax(grossLineTotal, taxRatePct);
  const taxableAmount = taxBreakdown.taxableAmount;
  const taxAmount = taxBreakdown.taxAmount;
  const grossUnitPrice = round(Number(item.finalUnitPrice || 0), 6);
  const unitValue = round(taxableAmount / quantity, 6);

  return {
    unidad: getUnitCode(item),
    cantidad: quantity,
    codProducto: getItemCode(item),
    descripcion: getItemDescription(item),
    mtoValorUnitario: unitValue,
    descuento: 0,
    igv: taxAmount,
    tipAfeIgv: TAXABLE_IGV_AFFECTATION,
    totalImpuestos: taxAmount,
    mtoPrecioUnitario: grossUnitPrice,
    mtoValorVenta: taxableAmount,
    mtoBaseIgv: taxableAmount,
    porcentajeIgv: taxRatePct,
  };
}

function assertSupportedDocumentType(documentType: DocumentType) {
  if (![DocumentType.BOLETA, DocumentType.FACTURA].includes(documentType)) {
    throw new BadRequestException('Por ahora solo se emiten boletas y facturas electronicas.');
  }
}

function assertCompanyReady(company: ApisPeruCompanyPayload) {
  const missing = [
    ['RUC de empresa', company.ruc],
    ['razon social de empresa', company.razonSocial],
    ['direccion fiscal de empresa', company.address?.direccion],
    ['ubigeo de empresa', company.address?.ubigueo],
  ].filter(([, value]) => !String(value ?? '').trim());

  if (missing.length) {
    throw new BadRequestException(`Faltan datos de empresa para emitir: ${missing.map(([label]) => label).join(', ')}.`);
  }
}

function assertClientReady(sale: Sale) {
  const client = sale.customer;
  const missing = [
    ['cliente', client?.name],
    ['tipo de documento SUNAT del cliente', client?.documentType?.sunatCode],
    ['numero de documento del cliente', client?.documentNumber],
  ].filter(([, value]) => !String(value ?? '').trim());

  if (missing.length) {
    throw new BadRequestException(`Faltan datos tributarios del cliente: ${missing.map(([label]) => label).join(', ')}.`);
  }

  if (sale.documentType === DocumentType.FACTURA && client.documentType?.sunatCode !== '6') {
    throw new BadRequestException('Una factura electronica requiere cliente con RUC.');
  }
}

function assertSaleReady(sale: Sale) {
  if (!sale.items?.length) {
    throw new BadRequestException('La venta no tiene lineas para emitir.');
  }

  if (!Number(sale.total || 0) || Number(sale.total || 0) <= 0) {
    throw new BadRequestException('La venta debe tener un total mayor a cero.');
  }
}

function buildPaymentTerms(sale: Sale): ApisPeruInvoicePayload['formaPago'] {
  const hasCreditPayment = (sale.payments ?? []).some((payment) => payment.method === 'CREDIT');
  if (!hasCreditPayment) {
    return { moneda: DEFAULT_CURRENCY, tipo: 'Contado' };
  }

  return {
    moneda: DEFAULT_CURRENCY,
    tipo: 'Credito',
    monto: round(Number(sale.total || 0)),
  };
}

function getUnitCode(item: SaleItem): string {
  if (item.itemType === 'SERVICE') return 'ZZ';

  const rawUnit = item.product?.baseUnit?.abbreviation || 'NIU';
  const normalized = rawUnit.trim().toUpperCase();
  if (['UND', 'UNID', 'UNIDAD'].includes(normalized)) return 'NIU';
  return normalized || 'NIU';
}

function getItemCode(item: SaleItem): string | null {
  if (item.itemType === 'SERVICE') return item.serviceCodeSnapshot ?? null;
  return item.product?.sku ?? null;
}

function getItemDescription(item: SaleItem): string {
  if (item.descriptionSnapshot) return item.descriptionSnapshot;
  if (item.itemType === 'SERVICE') return item.serviceNameSnapshot ?? 'SERVICIO';
  return item.product?.name ?? 'PRODUCTO';
}

function normalizeCorrelative(number: string): string {
  const normalized = String(number ?? '').trim();
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : normalized;
}

function toPeruIsoDate(date: string | Date): string {
  const value = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  return `${value}T00:00:00-05:00`;
}

function buildAmountLegend(total: number): string {
  const fixed = round(total).toFixed(2);
  return `SON ${fixed} SOLES`;
}

function round(value: number, decimals = 2): number {
  return Number(Number(value || 0).toFixed(decimals));
}
