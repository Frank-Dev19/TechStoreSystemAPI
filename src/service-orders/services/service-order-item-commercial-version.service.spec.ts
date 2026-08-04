import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ServiceOrderItemCommercialLine } from '../entities/service-order-item-commercial-line.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItemCommercialVersionStatus } from '../service-agreements/service-order-item-commercial-version-status.enum';
import { ServiceOrderItemCommercialVersionService } from './service-order-item-commercial-version.service';

const createQueryBuilder = (raw: Record<string, unknown> = {}) => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  withDeleted: jest.fn().mockReturnThis(),
  getRawOne: jest.fn().mockResolvedValue(raw),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
});

describe('ServiceOrderItemCommercialVersionService', () => {
  let service: ServiceOrderItemCommercialVersionService;
  let versionRepository: any;
  let lineRepository: any;
  let manager: jest.Mocked<EntityManager>;

  beforeEach(() => {
    versionRepository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      createQueryBuilder: jest.fn(),
    };
    lineRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    manager = {
      getRepository: jest.fn((entity) =>
        entity === ServiceOrderItemCommercialVersion ? versionRepository : lineRepository,
      ),
    } as unknown as jest.Mocked<EntityManager>;
    service = new ServiceOrderItemCommercialVersionService();
  });

  it('crea un draft derivado de la última versión aceptada solo para el item indicado', async () => {
    const base = {
      id: 41,
      serviceOrderItemId: 102,
      versionNumber: 3,
      status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
      totalAmount: 150,
      notes: 'Versión aceptada',
      lines: [
        {
          type: 'SERVICE',
          productId: null,
          serviceId: 1,
          catalogCodeSnapshot: 'TECHNICAL_SERVICE',
          catalogNameSnapshot: 'Servicio técnico',
          catalogDescriptionSnapshot: null,
          quantity: 1,
          unitPrice: 150,
          grossAmount: 150,
          discountAmount: 0,
          netAmount: 150,
          requiresPurchase: false,
          notes: null,
        },
      ],
    };
    versionRepository.findOne.mockResolvedValue(base);
    versionRepository.createQueryBuilder.mockReturnValue(createQueryBuilder({ max: '4' }));
    versionRepository.save.mockResolvedValue({ id: 55, serviceOrderItemId: 102, versionNumber: 5 });

    await service.createRediagnosisDraft(manager, 102, 9, 'Nuevo hallazgo');

    expect(versionRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serviceOrderItemId: 102, status: ServiceOrderItemCommercialVersionStatus.ACCEPTED },
        relations: ['lines'],
      }),
    );
    expect(versionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderItemId: 102,
        derivedFromVersionId: 41,
        versionNumber: 5,
        status: ServiceOrderItemCommercialVersionStatus.DRAFT,
      }),
    );
    expect(lineRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ commercialVersionId: 55, netAmount: 150 }),
    ]);
  });

  it('al aceptar reemplaza únicamente versiones aceptadas del mismo item', async () => {
    const draft = {
      id: 55,
      serviceOrderItemId: 102,
      derivedFromVersionId: 41,
      status: ServiceOrderItemCommercialVersionStatus.DRAFT,
      acceptedAt: null,
      acceptedByUserId: null,
    };
    const updateQuery = createQueryBuilder();
    versionRepository.findOne.mockResolvedValue(draft);
    versionRepository.createQueryBuilder.mockReturnValue(updateQuery);
    versionRepository.save.mockImplementation(async (value) => value);

    await service.acceptDraft(manager, 55, 9);

    expect(updateQuery.where).toHaveBeenCalledWith('service_order_item_id = :serviceOrderItemId', {
      serviceOrderItemId: 102,
    });
    expect(updateQuery.andWhere).toHaveBeenCalledWith('id <> :id', { id: 55 });
    expect(versionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 55,
        status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
        acceptedByUserId: 9,
      }),
    );
  });

  it('rechaza derivar cuando el item todavía no tiene una versión aceptada', async () => {
    versionRepository.findOne.mockResolvedValue(null);

    await expect(service.createRediagnosisDraft(manager, 102, 9)).rejects.toThrow(NotFoundException);
  });

  it('rechaza aceptar una versión que no es draft ni emitida', async () => {
    versionRepository.findOne.mockResolvedValue({
      id: 55,
      status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
    });

    await expect(service.acceptDraft(manager, 55, 9)).rejects.toThrow(BadRequestException);
  });
});
