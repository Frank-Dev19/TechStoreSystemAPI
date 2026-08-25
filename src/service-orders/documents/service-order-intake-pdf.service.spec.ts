import { promises as fs } from 'fs';
import PDFDocument from 'pdfkit';
import { ServiceOrderIntakePdfService } from './service-order-intake-pdf.service';

describe('ServiceOrderIntakePdfService', () => {
  let service: ServiceOrderIntakePdfService;
  const generatedPaths: string[] = [];

  beforeEach(() => {
    service = new ServiceOrderIntakePdfService();
  });

  afterEach(async () => {
    await Promise.all(
      generatedPaths.splice(0).map(async (path) => {
        try {
          await fs.unlink(path);
        } catch {
          // ignore cleanup failures for already-removed temp files
        }
      }),
    );
  });

  it('generates a PDF summary for a single order', async () => {
    const result = await service.generate({
      clientName: 'Juan Pérez',
      createdAt: new Date('2026-05-18T12:00:00.000Z'),
      orders: [
        {
          code: 'TS-10452',
          serviceType: 'DIAGNOSIS',
          equipmentLabel: 'Laptop Lenovo IdeaPad 3',
          technicianName: 'Carlos Rojas',
          initialIssue: 'No enciende',
        },
      ],
    });

    expect(result.fileName).toContain('resumen');
    expect(result.absolutePath.endsWith('.pdf')).toBe(true);
    generatedPaths.push(result.absolutePath);
    const file = await fs.readFile(result.absolutePath);
    expect(file.byteLength).toBeGreaterThan(5_000);
  });

  it('generates a PDF summary for multiple orders', async () => {
    const result = await service.generate({
      clientName: 'Juan Pérez',
      createdAt: new Date('2026-05-18T12:00:00.000Z'),
      orders: [
        {
          code: 'TS-10452',
          serviceType: 'DIAGNOSIS',
          equipmentLabel: 'Laptop Lenovo',
          technicianName: 'Carlos',
          initialIssue: 'No enciende',
        },
        {
          code: 'TS-10453',
          serviceType: 'STANDARD_SERVICE',
          equipmentLabel: 'iPhone 13',
          technicianName: 'Lucía',
          initialIssue: 'Cambio de batería',
        },
      ],
    });

    expect(result.absolutePath.endsWith('.pdf')).toBe(true);
    generatedPaths.push(result.absolutePath);
    const file = await fs.readFile(result.absolutePath);
    expect(file.byteLength).toBeGreaterThan(5_000);
  });

  it('supports optional notes and estimated delivery while keeping a non-trivial document size', async () => {
    const result = await service.generate({
      clientName: 'Juan Pérez',
      createdAt: new Date('2026-05-18T12:00:00.000Z'),
      orders: [
        {
          code: 'TS-10452',
          serviceType: 'DIAGNOSIS',
          equipmentLabel: 'Laptop Lenovo',
          technicianName: null,
          initialIssue: 'No enciende',
          estimatedDeliveryDate: '2026-05-20T18:00:00.000Z',
          notes: 'Cliente solicita revisión integral y llamada antes de proceder.',
        },
      ],
    });

    generatedPaths.push(result.absolutePath);
    const file = await fs.readFile(result.absolutePath);
    expect(file.byteLength).toBeGreaterThan(5_000);
  });

  it('can generate a multi-page batch without failing', async () => {
    const result = await service.generate({
      clientName: 'Juan Pérez',
      createdAt: new Date('2026-05-18T12:00:00.000Z'),
      orders: Array.from({ length: 18 }, (_, index) => ({
        code: `TS-${10452 + index}`,
        serviceType: index % 2 === 0 ? 'DIAGNOSIS' : 'STANDARD_SERVICE',
        equipmentLabel: `Equipo ${index + 1}`,
        technicianName: index % 3 === 0 ? null : `Técnico ${index + 1}`,
        initialIssue: `Falla reportada ${index + 1}`,
        estimatedDeliveryDate: index % 2 === 0 ? '2026-05-20T18:00:00.000Z' : null,
        notes: index % 4 === 0 ? `Notas ${index + 1}` : null,
      })),
    });

    generatedPaths.push(result.absolutePath);
    const file = await fs.readFile(result.absolutePath);
    expect(file.byteLength).toBeGreaterThan(12_000);
  });

  it('genera el resumen PDF single reutilizando el mismo branding backend', async () => {
    const buffer = await service.generateSingleOrderSummaryBuffer({
      code: 'SO202605200001',
      createdAt: new Date('2026-05-20T14:30:00.000Z'),
      operativeStatus: 'ABIERTA',
      serviceType: 'DIAGNOSIS',
      clientName: 'Juan Pérez',
      clientDocument: 'DNI: 12345678',
      clientPhone: '+51999999999',
      clientEmail: 'juan@test.com',
      equipmentType: 'LAPTOP',
      brand: 'Lenovo',
      model: 'ThinkPad',
      serialNumber: 'SER-123',
      accessories: 'Cargador',
      notes: 'Equipo con desgaste en bisagras.',
      initialIssue: 'No enciende luego de una sobretensión.',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(8_000);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('renderiza todos los equipos de una orden en orden de posición', async () => {
    const drawItemSpy = jest.spyOn<any, any>(service as any, 'drawSingleOrderItemCard');

    const buffer = await service.generateSingleOrderSummaryBuffer({
      code: 'SO-02-08-2026-0001',
      createdAt: new Date('2026-08-02T15:40:00.000Z'),
      operativeStatus: 'ABIERTA',
      serviceType: 'DIAGNOSIS',
      clientName: 'Sergio Ávila',
      clientDocument: 'DNI: 12345678',
      clientPhone: '+51932998578',
      clientEmail: null,
      items: [
        {
          position: 2,
          code: 'SO-02-08-2026-0001-02',
          priority: 'HIGH',
          equipmentType: 'PRINTER',
          brand: 'Epson',
          model: 'L4260',
          serialNumber: 'EP-002',
          accessories: 'Cable de poder',
          notes: null,
          initialIssue: 'Atasca papel',
        },
        {
          position: 1,
          code: 'SO-02-08-2026-0001-01',
          priority: 'LOW',
          equipmentType: 'LAPTOP',
          brand: 'Lenovo',
          model: 'T14',
          serialNumber: 'LN-001',
          accessories: 'Cargador',
          notes: 'Carcasa marcada',
          initialIssue: 'No enciende',
        },
      ],
    });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(drawItemSpy.mock.calls.map((call) => (call[1] as { code: string }).code)).toEqual([
      'SO-02-08-2026-0001-01',
      'SO-02-08-2026-0001-02',
    ]);
  });

  it('no genera páginas en blanco extra en el resumen single', async () => {
    const buffer = await service.generateSingleOrderSummaryBuffer({
      code: 'SO202605200002',
      createdAt: new Date('2026-05-20T14:29:00.000Z'),
      operativeStatus: 'ABIERTA',
      serviceType: 'DIAGNOSIS',
      clientName: 'Sergio Avila',
      clientDocument: 'RUC: 10741181181',
      clientPhone: '+51932998578',
      clientEmail: null,
      equipmentType: 'LAPTOP',
      brand: 'Lenovo',
      model: 'ThinkPad X1',
      serialNumber: 'KNASF',
      accessories: 'Cargador',
      notes: 'Nota #2',
      initialIssue: 'Sobrecalentamiento',
    });

    const pageCounts = [...buffer.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map((match) => Number(match[1]));
    expect(Math.max(...pageCounts)).toBeLessThanOrEqual(2);
  });

  it('mantiene el resumen editorial dentro del área imprimible', () => {
    const document = new PDFDocument({ margin: 50, autoFirstPage: false });
    document.addPage();
    const startY = 80;
    const renderedEndY = (service as any).drawSingleOrderOverview(
      document,
      {
        code: 'SO202605200002',
        createdAt: new Date('2026-05-20T14:29:00.000Z'),
        operativeStatus: 'ABIERTA',
        serviceType: 'DIAGNOSIS',
        clientName: 'Sergio Avila',
        clientDocument: 'RUC: 10741181181',
        clientPhone: '+51932998578',
        clientEmail: null,
        equipmentType: 'LAPTOP',
        brand: 'Lenovo',
        model: 'ThinkPad X1',
        serialNumber: 'KNASF',
        accessories: 'Cargador',
        notes: 'Nota #2',
        initialIssue: 'Sobrecalentamiento',
      },
      startY,
    );

    expect(renderedEndY).toBeGreaterThan(startY);
    expect(renderedEndY).toBeLessThan((service as any).getContentBottom(document));
  });

  it('renderiza términos y condiciones sin contenedor con borde', () => {
    const document = new PDFDocument({ margin: 50, autoFirstPage: false });
    document.addPage();
    const roundedRectSpy = jest.spyOn(document as any, 'roundedRect');

    (service as any).drawTermsSection(document, 120);

    expect(roundedRectSpy).not.toHaveBeenCalled();
  });

  it('incluye la sección de términos cuando genera el PDF intake', async () => {
    const drawTermsSpy = jest.spyOn<any, any>(service as any, 'drawTermsSection');

    const result = await service.generate({
      clientName: 'Sergio Avila',
      createdAt: new Date('2026-05-20T14:29:00.000Z'),
      orders: [
        {
          code: 'SO2026052014290001',
          serviceType: 'DIAGNOSIS',
          equipmentLabel: 'Asus TUF A16',
          technicianName: 'Juan Carlos León Guzmán',
          initialIssue: 'Pantalla no enciende',
          notes: 'Nota #1',
        },
        {
          code: 'SO2026052014290002',
          serviceType: 'DIAGNOSIS',
          equipmentLabel: 'Lenovo ThinkPad X1',
          technicianName: 'Juan Carlos León Guzmán',
          initialIssue: 'Sobrecalentamiento',
          notes: 'Nota #2',
        },
      ],
    });

    generatedPaths.push(result.absolutePath);
    expect(drawTermsSpy).toHaveBeenCalled();
  });

  it('reserva una página limpia para los términos del PDF single', async () => {
    const drawHeaderSpy = jest.spyOn<any, any>(service as any, 'drawHeader');

    await service.generateSingleOrderSummaryBuffer({
      code: 'SO202605200002',
      createdAt: new Date('2026-05-20T15:40:00.000Z'),
      operativeStatus: 'ABIERTA',
      serviceType: 'DIAGNOSIS',
      clientName: 'Sergio Avila',
      clientDocument: 'RUC: 10741181181',
      clientPhone: '+51932998578',
      clientEmail: null,
      equipmentType: 'LAPTOP',
      brand: 'Lenovo',
      model: 'ThinkPad X1',
      serialNumber: 'KNASF',
      accessories: 'Cargador',
      notes: 'Nota #2',
      initialIssue: 'Sobrecalentamiento',
    });

    expect(drawHeaderSpy.mock.calls).toHaveLength(1);
    expect(drawHeaderSpy.mock.calls[0][2]).toBe('Resumen de recepción');
  });

  it('no repite el título del resumen en la página de términos del PDF intake', async () => {
    const drawHeaderSpy = jest.spyOn<any, any>(service as any, 'drawHeader');

    const result = await service.generate({
      clientName: 'Sergio Avila',
      createdAt: new Date('2026-05-20T15:40:00.000Z'),
      orders: [
        {
          code: 'SO2026052015400001',
          serviceType: 'DIAGNOSIS',
          equipmentLabel: 'Asus TUF A16',
          technicianName: 'Juan Carlos León Guzmán',
          initialIssue: 'Pantalla no enciende',
          notes: 'Nota #1',
        },
        {
          code: 'SO2026052015400002',
          serviceType: 'DIAGNOSIS',
          equipmentLabel: 'Lenovo ThinkPad X1',
          technicianName: 'Juan Carlos León Guzmán',
          initialIssue: 'Sobrecalentamiento',
          notes: 'Nota #2',
        },
      ],
    });

    generatedPaths.push(result.absolutePath);
    expect(drawHeaderSpy.mock.calls).toHaveLength(2);
    expect(drawHeaderSpy.mock.calls[0][2]).toBe('Recepción de órdenes de servicio');
    expect(drawHeaderSpy.mock.calls[1][2]).toBeNull();
  });
});
