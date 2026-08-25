import { ConfigService } from '@nestjs/config';
import { ServiceOrderCommercialIssuanceService } from './service-order-commercial-issuance.service';
import { ServiceOrderItemCommercialVersionStatus } from './service-order-item-commercial-version-status.enum';

describe('ServiceOrderCommercialIssuanceService', () => {
  it('envía una versión derivada con la plantilla de rediagnóstico y el PDF actualizado', async () => {
    const version = {
      id: 42,
      serviceOrderItemId: 9,
      derivedFromVersionId: 15,
      versionNumber: 2,
      status: ServiceOrderItemCommercialVersionStatus.DRAFT,
      totalAmount: 280,
      createdAt: new Date('2026-08-24T10:00:00-05:00'),
      notes: null,
      lines: [],
      serviceOrderItem: {
        code: 'SO-24-08-2026-0001-01',
        equipmentType: 'LAPTOP',
        equipmentTypeOther: null,
        brand: 'Lenovo',
        model: 'ThinkPad',
        serialNumber: 'SN1',
        serviceOrder: {
          id: 3,
          code: 'SO-24-08-2026-0001',
          clientSnapshotName: 'Juan',
          clientSnapshotPhone: '+51999999999',
        },
      },
    } as any;
    const versionRepository = {
      findOne: jest.fn().mockResolvedValue(version),
      save: jest.fn(async (value) => value),
    } as any;
    const diagnosisRepository = {
      findOne: jest.fn().mockResolvedValue({ summary: 'Nueva avería', details: 'Detalle' }),
    } as any;
    const pdfService = { generateBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')) } as any;
    const tempDocumentsService = {
      createRecord: jest.fn().mockResolvedValue({ token: 'token-1' }),
    } as any;
    const messageMatrixService = {
      dispatchDiagnosisQuoteTemplate: jest.fn().mockResolvedValue('SENT'),
    } as any;
    const configService = {
      get: jest.fn((key: string) => key === 'APP_PUBLIC_BASE_URL' ? 'https://api.example.com' : undefined),
    } as unknown as ConfigService;
    const service = new ServiceOrderCommercialIssuanceService(
      versionRepository,
      diagnosisRepository,
      pdfService,
      tempDocumentsService,
      messageMatrixService,
      configService,
    );

    await service.issue(42);

    expect(messageMatrixService.dispatchDiagnosisQuoteTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialVersionId: 42,
        isRediagnosis: true,
        documentUrl: 'https://api.example.com/service-orders/temp-documents/token-1',
      }),
    );
  });
});
