import { ElectronicBillingService } from './electronic-billing.service';
import { ElectronicCancellationStatus } from './enums/electronic-cancellation-status.enum';
import { DocumentType } from '../sales/enums/document-type.enum';
import { ElectronicDocumentStatus } from './enums/electronic-document-status.enum';
import { SaleStatus } from '../sales/enums/sale-status.enum';

describe('ElectronicBillingService cancellation mapping', () => {
  const service = Object.create(
    ElectronicBillingService.prototype,
  ) as ElectronicBillingService;

  it('crea comunicación de baja para una factura', () => {
    const payload = (service as any).buildCancellationPayload(
      { documentType: DocumentType.FACTURA, issueDate: '2026-09-07' },
      {
        id: 12,
        sunatDocumentTypeCode: '01',
        series: 'F001',
        number: '00000042',
      },
      { ruc: '20123456789', razonSocial: 'Macrochips' },
      'ERROR EN LA OPERACION',
    );
    expect(payload.details[0]).toEqual(
      expect.objectContaining({
        tipoDoc: '01',
        serie: 'F001',
        correlativo: '42',
        desMotivoBaja: 'ERROR EN LA OPERACION',
      }),
    );
    expect(payload.fecComunicacion).toMatch(/-05:00$/);
  });

  it('crea resumen de anulación para una boleta usando sus importes fiscales', () => {
    const payload = (service as any).buildCancellationPayload(
      { documentType: DocumentType.BOLETA, issueDate: '2026-09-07' },
      {
        id: 13,
        sunatDocumentTypeCode: '03',
        series: 'B001',
        number: '00000009',
        payloadJson: {
          tipoDoc: '03',
          serie: 'B001',
          correlativo: '9',
          company: {},
          details: [],
          tipoMoneda: 'PEN',
          client: { tipoDoc: '1', numDoc: '12345678' },
          mtoImpVenta: 118,
          mtoOperGravadas: 100,
          mtoIGV: 18,
        },
      },
      { ruc: '20123456789', razonSocial: 'Macrochips' },
      'ERROR',
    );
    expect(payload.details[0]).toEqual(
      expect.objectContaining({
        tipoDoc: '03',
        serieNro: 'B001-9',
        estado: '3',
        total: 118,
      }),
    );
  });

  it('mantiene pendiente el ticket 98 y acepta una respuesta exitosa', () => {
    expect((service as any).resolveTicketStatus({ code: '98' }).status).toBe(
      ElectronicCancellationStatus.PENDING,
    );
    expect((service as any).resolveTicketStatus({ success: true }).status).toBe(
      ElectronicCancellationStatus.ACCEPTED,
    );
  });

  it.each([
    ['01', 'ANULACION DE LA OPERACION'],
    ['06', 'DEVOLUCION TOTAL'],
  ])('conserva el motivo SUNAT %s en una nota de crédito total', (reasonCode, reason) => {
    const payload = (service as any).buildFullCreditNotePayload(
      { series: 'BC01', number: '00000001', reasonCode, reason },
      { sunatDocumentTypeCode: '03', series: 'B001', number: '00000025' },
      {
        tipoMoneda: 'PEN', client: {}, details: [], legends: [],
        mtoOperGravadas: 100, mtoIGV: 18, totalImpuestos: 18, mtoImpVenta: 118,
      },
      { ruc: '20123456789', razonSocial: 'Macrochips' },
    );
    expect(payload).toEqual(expect.objectContaining({
      tipoDoc: '07', codMotivo: reasonCode, desMotivo: reason,
      tipDocAfectado: '03', numDocfectado: 'B001-25',
    }));
  });

  it('bloquea una nota de crédito cuando ya existe una baja fiscal activa', () => {
    expect(() => (service as any).assertNoBlockingCancellation({
      cancellationStatus: ElectronicCancellationStatus.PENDING,
    })).toThrow('solicitud de baja');
    expect(() => (service as any).assertNoBlockingCancellation({
      cancellationStatus: ElectronicCancellationStatus.REJECTED,
    })).not.toThrow();
  });

  it('informa cuando SUNAT aceptó la nota pero falta aplicar la devolución local', () => {
    const summary = (service as any).toCreditNoteSummary({
      id: 1,
      saleId: 25,
      series: 'BC01',
      number: '00000001',
      reasonCode: '01',
      reason: 'ANULACION DE LA OPERACION',
      refundMethod: 'CASH',
      amount: 100,
      status: ElectronicDocumentStatus.ACCEPTED,
      createdAt: new Date(),
    }, SaleStatus.CONFIRMED);

    expect(summary.localApplicationPending).toBe(true);
  });
});

describe('ElectronicBillingService fiscal reversal safeguards', () => {
  it('no envía una baja a SUNAT cuando la caja no puede revertir los pagos', async () => {
    const service = Object.create(ElectronicBillingService.prototype) as ElectronicBillingService;
    const insufficientBalance = new Error('Saldo insuficiente');
    const salesService = {
      validateCancellationAvailability: jest.fn().mockRejectedValue(insufficientBalance),
    };
    const apisPeruClient = { sendSummary: jest.fn(), sendVoided: jest.fn() };
    Object.assign(service as any, {
      salesService,
      apisPeruClient,
      electronicDocumentRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 9,
          status: ElectronicDocumentStatus.ACCEPTED,
          cancellationStatus: null,
        }),
      },
    });
    jest.spyOn(service as any, 'findSaleForBilling').mockResolvedValue({
      id: 25,
      status: SaleStatus.CONFIRMED,
      documentType: DocumentType.BOLETA,
    });
    jest.spyOn(service as any, 'assertNoBlockingCreditNote').mockResolvedValue(undefined);
    const claimSpy = jest.spyOn(service as any, 'claimCancellation');

    await expect(service.requestCancellation(25, {
      reason: 'COMPROBANTE EMITIDO POR ERROR Y NO ENTREGADO',
    }, 'tester')).rejects.toBe(insufficientBalance);

    expect(claimSpy).not.toHaveBeenCalled();
    expect(apisPeruClient.sendSummary).not.toHaveBeenCalled();
    expect(apisPeruClient.sendVoided).not.toHaveBeenCalled();
  });

  it('no contacta a SUNAT cuando el medio elegido no tiene saldo suficiente', async () => {
    const service = Object.create(ElectronicBillingService.prototype) as ElectronicBillingService;
    const insufficientBalance = new Error('Saldo insuficiente');
    const salesService = {
      validateFullRefundAvailability: jest.fn().mockRejectedValue(insufficientBalance),
    };
    const apisPeruClient = { sendCreditNote: jest.fn() };
    Object.assign(service as any, {
      salesService,
      apisPeruClient,
      electronicDocumentRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 9, status: ElectronicDocumentStatus.ACCEPTED }),
      },
    });
    jest.spyOn(service as any, 'findSaleById').mockResolvedValue({
      id: 25,
      status: SaleStatus.CONFIRMED,
    });
    const claimSpy = jest.spyOn(service as any, 'claimCreditNote');

    await expect(service.requestFullRefund(25, {
      reasonCode: '01',
      reason: 'ANULACION DE LA OPERACION',
      refundMethod: 'CASH',
    } as any, 'tester')).rejects.toBe(insufficientBalance);

    expect(claimSpy).not.toHaveBeenCalled();
    expect(apisPeruClient.sendCreditNote).not.toHaveBeenCalled();
  });

  it('completa una nota aceptada con el nuevo medio de devolución sin volver a emitirla', async () => {
    const service = Object.create(ElectronicBillingService.prototype) as ElectronicBillingService;
    const acceptedNote = {
      id: 4,
      saleId: 25,
      reasonCode: '01',
      reason: 'ANULACION DE LA OPERACION',
      refundMethod: 'CASH',
      amount: 108.56,
      status: ElectronicDocumentStatus.ACCEPTED,
      createdAt: new Date(),
    };
    const salesService = {
      validateFullRefundAvailability: jest.fn().mockResolvedValue(undefined),
      refundFull: jest.fn().mockResolvedValue({ id: 25, status: SaleStatus.REFUNDED }),
    };
    const apisPeruClient = { sendCreditNote: jest.fn() };
    Object.assign(service as any, {
      salesService,
      apisPeruClient,
      electronicDocumentRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 9, status: ElectronicDocumentStatus.ACCEPTED }),
      },
      creditNoteRepo: { save: jest.fn().mockImplementation(async (note) => note) },
    });
    jest.spyOn(service as any, 'findSaleById').mockResolvedValue({
      id: 25,
      status: SaleStatus.CONFIRMED,
    });
    jest.spyOn(service as any, 'claimCreditNote').mockResolvedValue({
      note: acceptedNote,
      shouldSend: false,
    });

    await service.requestFullRefund(25, {
      reasonCode: '01',
      reason: 'ANULACION DE LA OPERACION',
      refundMethod: 'PLIN',
    } as any, 'tester');

    expect(salesService.refundFull).toHaveBeenCalledWith(
      25,
      'ANULACION DE LA OPERACION',
      'PLIN',
      'tester',
      undefined,
    );
    expect(acceptedNote.refundMethod).toBe('PLIN');
    expect(apisPeruClient.sendCreditNote).not.toHaveBeenCalled();
  });

  it('envía una nota recién reservada y después aplica la devolución local', async () => {
    const service = Object.create(ElectronicBillingService.prototype) as ElectronicBillingService;
    const pendingNote = {
      id: 5,
      saleId: 25,
      series: 'BC01',
      number: '00000005',
      reasonCode: '01',
      reason: 'ANULACION DE LA OPERACION',
      refundMethod: 'CASH',
      amount: 217.12,
      status: ElectronicDocumentStatus.PENDING,
      payloadJson: null,
      createdAt: new Date(),
    };
    const invoicePayload = {
      tipoDoc: '03',
      serie: 'B001',
      correlativo: '11',
      tipoMoneda: 'PEN',
      company: {},
      client: { tipoDoc: '1', numDoc: '76242929' },
      details: [],
      legends: [],
      mtoOperGravadas: 184,
      mtoIGV: 33.12,
      totalImpuestos: 33.12,
      mtoImpVenta: 217.12,
    };
    const document = {
      id: 9,
      status: ElectronicDocumentStatus.ACCEPTED,
      sunatDocumentTypeCode: '03',
      series: 'B001',
      number: '00000011',
      payloadJson: invoicePayload,
    };
    const salesService = {
      validateFullRefundAvailability: jest.fn().mockResolvedValue(undefined),
      refundFull: jest.fn().mockResolvedValue({ id: 25, status: SaleStatus.REFUNDED }),
    };
    const apisPeruClient = {
      sendCreditNote: jest.fn().mockResolvedValue({
        xml: '<xml/>',
        sunatResponse: { success: true, cdrZip: 'cdr', cdrResponse: { description: 'Aceptada' } },
      }),
    };
    Object.assign(service as any, {
      salesService,
      apisPeruClient,
      businessProfileService: {
        getInvoiceCompanyPayload: jest.fn().mockResolvedValue({ ruc: '20123456789' }),
      },
      electronicDocumentRepo: { findOne: jest.fn().mockResolvedValue(document) },
      creditNoteRepo: { save: jest.fn().mockImplementation(async (note) => note) },
    });
    jest.spyOn(service as any, 'findSaleById').mockResolvedValue({
      id: 25,
      companyId: 1,
      documentType: DocumentType.BOLETA,
      status: SaleStatus.CONFIRMED,
    });
    jest.spyOn(service as any, 'claimCreditNote').mockResolvedValue({
      note: pendingNote,
      shouldSend: true,
    });

    const result = await service.requestFullRefund(25, {
      reasonCode: '01',
      reason: 'ANULACION DE LA OPERACION',
      refundMethod: 'CASH',
    } as any, 'tester');

    expect(apisPeruClient.sendCreditNote).toHaveBeenCalledTimes(1);
    expect(apisPeruClient.sendCreditNote).toHaveBeenCalledWith(
      expect.objectContaining({ serie: 'BC01', correlativo: '5', codMotivo: '01' }),
    );
    expect(salesService.refundFull).toHaveBeenCalledTimes(1);
    expect(pendingNote.status).toBe(ElectronicDocumentStatus.ACCEPTED);
    expect(result.sale.status).toBe(SaleStatus.REFUNDED);
  });

  it('no duplica el envío cuando otra solicitud mantiene una nota activa', async () => {
    const service = Object.create(ElectronicBillingService.prototype) as ElectronicBillingService;
    const apisPeruClient = { sendCreditNote: jest.fn() };
    Object.assign(service as any, {
      salesService: { validateFullRefundAvailability: jest.fn().mockResolvedValue(undefined) },
      apisPeruClient,
      electronicDocumentRepo: {
        findOne: jest.fn().mockResolvedValue({ id: 9, status: ElectronicDocumentStatus.ACCEPTED }),
      },
    });
    jest.spyOn(service as any, 'findSaleById').mockResolvedValue({
      id: 25,
      status: SaleStatus.CONFIRMED,
    });
    jest.spyOn(service as any, 'claimCreditNote').mockResolvedValue({
      note: { status: ElectronicDocumentStatus.PENDING },
      shouldSend: false,
    });

    await expect(service.requestFullRefund(25, {
      reasonCode: '01',
      reason: 'ANULACION DE LA OPERACION',
      refundMethod: 'CASH',
    } as any, 'tester')).rejects.toThrow('todavía está en proceso');

    expect(apisPeruClient.sendCreditNote).not.toHaveBeenCalled();
  });

  it('recupera una reserva antigua sin payload usando la misma nota y correlativo', async () => {
    const service = Object.create(ElectronicBillingService.prototype) as ElectronicBillingService;
    const existingNote = {
      id: 5,
      saleId: 25,
      series: 'BC01',
      number: '00000005',
      reasonCode: '01',
      refundMethod: 'YAPE',
      observations: 'anterior',
      status: ElectronicDocumentStatus.PENDING,
      payloadJson: null,
      createdAt: new Date(Date.now() - 60_000),
      updatedAt: new Date(Date.now() - 60_000),
    };
    const manager = {
      findOne: jest.fn()
        .mockResolvedValueOnce({ id: 9 })
        .mockResolvedValueOnce(existingNote),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
    };
    Object.assign(service as any, {
      dataSource: { transaction: jest.fn((callback) => callback(manager)) },
      documentSeriesService: { reserveNextCreditNoteNumber: jest.fn() },
    });

    const result = await (service as any).claimCreditNote(
      { id: 25 },
      { id: 9 },
      '01',
      { reason: 'ANULACION DE LA OPERACION', refundMethod: 'CASH', observations: 'nuevo intento' },
      'tester',
    );

    expect(result).toEqual({ note: existingNote, shouldSend: true });
    expect(existingNote.number).toBe('00000005');
    expect(existingNote.refundMethod).toBe('CASH');
    expect((service as any).documentSeriesService.reserveNextCreditNoteNumber).not.toHaveBeenCalled();
  });
});

describe('ElectronicBillingService automatic receipt email', () => {
  it('envía el comprobante automáticamente cuando el cliente tiene correo', async () => {
    const service = Object.create(ElectronicBillingService.prototype) as ElectronicBillingService;
    const emailInvoice = jest.spyOn(service, 'emailInvoice').mockResolvedValue({
      ok: true,
      saleId: 25,
      to: 'cliente@example.com',
      message: 'Enviado',
    });

    const result = await (service as any).tryEmailAcceptedInvoice(
      { id: 25, billingSnapshotEmail: 'cliente@example.com' },
      { id: 9 },
    );

    expect(emailInvoice).toHaveBeenCalledWith(25, { to: 'cliente@example.com' });
    expect(result).toEqual(expect.objectContaining({
      status: 'SENT',
      to: 'cliente@example.com',
    }));
  });

  it('omite el correo sin afectar la emisión cuando el cliente no tiene dirección registrada', async () => {
    const service = Object.create(ElectronicBillingService.prototype) as ElectronicBillingService;
    const emailInvoice = jest.spyOn(service, 'emailInvoice');

    const result = await (service as any).tryEmailAcceptedInvoice(
      { id: 25, billingSnapshotEmail: null, customer: { email: null } },
      { id: 9 },
    );

    expect(emailInvoice).not.toHaveBeenCalled();
    expect(result.status).toBe('SKIPPED');
  });

  it('conserva la aceptación fiscal cuando falla el servicio de correo', async () => {
    const service = Object.create(ElectronicBillingService.prototype) as ElectronicBillingService;
    const logger = { error: jest.fn() };
    Object.assign(service as any, { logger });
    jest.spyOn(service, 'emailInvoice').mockRejectedValue(new Error('SMTP no disponible'));

    const result = await (service as any).tryEmailAcceptedInvoice(
      { id: 25, billingSnapshotEmail: 'cliente@example.com' },
      { id: 9 },
    );

    expect(result.status).toBe('FAILED');
    expect(logger.error).toHaveBeenCalled();
  });
});
