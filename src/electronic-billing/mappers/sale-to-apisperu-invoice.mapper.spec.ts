import { mapSaleToApisPeruInvoicePayload } from './sale-to-apisperu-invoice.mapper';
import { DocumentType } from '../../sales/enums/document-type.enum';

describe('Service-order receipt concept', () => {
  const company: any = { ruc: '20123456789', razonSocial: 'Empresa', address: { direccion: 'Lima', ubigueo: '150101' } };
  const sale: any = {
    documentType: DocumentType.BOLETA, series: 'B001', number: '1', issueDate: '2026-10-11',
    customer: { name: 'Cliente', documentNumber: '12345678', documentType: { sunatCode: '1' } },
    total: 354, subtotal: 300, taxAmount: 54, taxRate: 0.18,
    items: [
      { id: 1, itemType: 'SERVICE', serviceNameSnapshot: 'Servicio técnico', quantity: 1, lineTotal: 118, finalUnitPrice: 118 },
      { id: 2, itemType: 'PRODUCT', productId: 1, descriptionSnapshot: 'RAM - SO-11-10-2026-0001-01', quantity: 2, lineTotal: 118, finalUnitPrice: 59 },
      { id: 3, itemType: 'PRODUCT', productId: 2, descriptionSnapshot: 'SSD 2TB - SO-11-10-2026-0001-01', quantity: 2, lineTotal: 118, finalUnitPrice: 59 },
    ],
  };
  it('emits one concept and preserves exact sale amounts', () => {
    const payload = mapSaleToApisPeruInvoicePayload(sale, company, true);
    expect(payload.details).toHaveLength(1);
    expect(payload.details[0]).toEqual(expect.objectContaining({
      descripcion: 'Servicio técnico + 2 RAM + 2 SSD 2TB', cantidad: 1,
      mtoPrecioUnitario: 354, mtoValorVenta: 300, igv: 54,
    }));
  });
  it('leaves ordinary sales and facturas itemized', () => {
    expect(mapSaleToApisPeruInvoicePayload(sale, company).details).toHaveLength(3);
    const factura = { ...sale, documentType: DocumentType.FACTURA, customer: { ...sale.customer, documentNumber: '20123456789', documentType: { sunatCode: '6' } } };
    expect(mapSaleToApisPeruInvoicePayload(factura, company, true).details).toHaveLength(3);
  });

  it('sends exact SUNAT units for services and products after a catalog reset', () => {
    const details = mapSaleToApisPeruInvoicePayload(sale, company).details;
    expect(details.map(detail => detail.unidad)).toEqual(['ZZ', 'NIU', 'NIU']);
    const consolidated = mapSaleToApisPeruInvoicePayload(sale, company, true);
    expect(consolidated.details[0].unidad).toBe('ZZ');
  });

  it('normalizes unit aliases and preserves specific product measurement codes', () => {
    const products = ['UND', 'NIU', 'LTR'].map((abbreviation, index) => ({
      ...sale.items[1], id: index + 10, product: { name: 'Producto', baseUnit: { abbreviation } },
    }));
    const details = mapSaleToApisPeruInvoicePayload({ ...sale, items: products }, company).details;
    expect(details.map(detail => detail.unidad)).toEqual(['NIU', 'NIU', 'LTR']);
  });
});
