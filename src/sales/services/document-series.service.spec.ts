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
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<DocumentSeries>>;
    service = new DocumentSeriesService(repository);
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
