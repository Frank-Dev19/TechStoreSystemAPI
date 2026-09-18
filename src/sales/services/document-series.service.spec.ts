import { BadRequestException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { DocumentSeries } from '../entities/document-series.entity';
import { DocumentType } from '../enums/document-type.enum';
import { DocumentSeriesService } from './document-series.service';

describe('DocumentSeriesService', () => {
  let repository: jest.Mocked<Repository<DocumentSeries>>;
  let service: DocumentSeriesService;

  beforeEach(() => {
    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<DocumentSeries>>;
    service = new DocumentSeriesService(repository);
  });

  it('crea las cuatro series predeterminadas cuando no hay familias configuradas', async () => {
    repository.find.mockResolvedValue([]);
    repository.save.mockImplementation(async (entities) => entities as any);

    await expect(service.ensureDefaultSeries(1)).resolves.toBe(4);

    expect(repository.save).toHaveBeenCalledWith([
      expect.objectContaining({ companyId: 1, documentType: DocumentType.BOLETA, code: 'B001', currentNumber: 1 }),
      expect.objectContaining({ companyId: 1, documentType: DocumentType.FACTURA, code: 'F001', currentNumber: 1 }),
      expect.objectContaining({ companyId: 1, documentType: DocumentType.NOTA_CREDITO, code: 'BC01', currentNumber: 1 }),
      expect.objectContaining({ companyId: 1, documentType: DocumentType.NOTA_CREDITO, code: 'FC01', currentNumber: 1 }),
    ]);
  });

  it('respeta familias existentes y crea solamente las que faltan', async () => {
    repository.find.mockResolvedValue([
      { documentType: DocumentType.BOLETA, code: 'B002', currentNumber: 25, isActive: true },
      { documentType: DocumentType.FACTURA, code: 'F001', currentNumber: 9, isActive: false },
      { documentType: DocumentType.NOTA_CREDITO, code: 'BC02', deletedAt: new Date() },
    ] as DocumentSeries[]);
    repository.save.mockImplementation(async (entities) => entities as any);

    await expect(service.ensureDefaultSeries(1)).resolves.toBe(1);

    expect(repository.save).toHaveBeenCalledWith([
      expect.objectContaining({ code: 'FC01', documentType: DocumentType.NOTA_CREDITO }),
    ]);
  });

  it('no duplica ni reinicia series en arranques posteriores', async () => {
    repository.find.mockResolvedValue([
      { documentType: DocumentType.BOLETA, code: 'B001', currentNumber: 25 },
      { documentType: DocumentType.FACTURA, code: 'F001', currentNumber: 9 },
      { documentType: DocumentType.NOTA_CREDITO, code: 'BC01', currentNumber: 3 },
      { documentType: DocumentType.NOTA_CREDITO, code: 'FC01', currentNumber: 7 },
    ] as DocumentSeries[]);

    await expect(service.ensureDefaultSeries(1)).resolves.toBe(0);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('consulta el siguiente correlativo sin consumirlo', async () => {
    repository.findOne.mockResolvedValue({
      id: 3,
      companyId: 1,
      documentType: DocumentType.BOLETA,
      code: 'B001',
      currentNumber: 12,
      isActive: true,
    } as DocumentSeries);

    await expect(service.getNextNumber(1, DocumentType.BOLETA)).resolves.toEqual({
      series: 'B001',
      number: '00000012',
    });
  });

  it('reserva e incrementa el correlativo usando la transaccion de la venta', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 3,
        companyId: 1,
        documentType: DocumentType.BOLETA,
        code: 'B001',
        currentNumber: 12,
        isActive: true,
      }),
      increment: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EntityManager>;

    await expect(
      service.reserveNextNumber(manager, 1, DocumentType.BOLETA),
    ).resolves.toEqual({
      documentSeriesId: 3,
      series: 'B001',
      number: '00000012',
    });

    expect(manager.findOne).toHaveBeenCalledWith(DocumentSeries, {
      where: {
        companyId: 1,
        documentType: DocumentType.BOLETA,
        isActive: true,
      },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.increment).toHaveBeenCalledWith(
      DocumentSeries,
      { id: 3 },
      'currentNumber',
      1,
    );
  });

  it('no incrementa cuando no existe una serie activa', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      increment: jest.fn(),
    } as unknown as jest.Mocked<EntityManager>;

    await expect(
      service.reserveNextNumber(manager, 1, DocumentType.FACTURA),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.increment).not.toHaveBeenCalled();
  });
});
