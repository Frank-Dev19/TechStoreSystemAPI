import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Product } from '../../inventory/entities/product.entity';
import { PricingEngineService } from '../../pricing/services/pricing-engine.service';
import { CreateServiceOrderItemDto } from '../dto/create-service-order-aggregate.dto';
import { ServiceOrderItemCommercialLine } from '../entities/service-order-item-commercial-line.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { EquipmentType, ServiceType } from '../enums';
import { ServiceOrderAgreementItem } from '../service-agreements/entities/service-agreement-item.entity';
import { ServiceOrderAgreement } from '../service-agreements/entities/service-agreement.entity';
import { ServiceOrderCommercialLineType } from '../service-agreements/service-order-commercial-line-type.enum';
import { ServiceOrderInitialCommercialService } from './service-order-initial-commercial.service';

type MockRepo = {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
};

const createRepo = (): MockRepo => ({
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => value),
  find: jest.fn(),
});

describe('ServiceOrderInitialCommercialService', () => {
  let service: ServiceOrderInitialCommercialService;
  let manager: jest.Mocked<EntityManager>;
  let versionRepo: MockRepo;
  let lineRepo: MockRepo;
  let agreementRepo: MockRepo;
  let agreementItemRepo: MockRepo;
  let productRepo: MockRepo;
  let pricingEngine: jest.Mocked<PricingEngineService>;

  beforeEach(() => {
    versionRepo = createRepo();
    lineRepo = createRepo();
    agreementRepo = createRepo();
    agreementItemRepo = createRepo();
    productRepo = createRepo();
    manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity === ServiceOrderItemCommercialVersion) return versionRepo;
        if (entity === ServiceOrderItemCommercialLine) return lineRepo;
        if (entity === ServiceOrderAgreement) return agreementRepo;
        if (entity === ServiceOrderAgreementItem) return agreementItemRepo;
        if (entity === Product) return productRepo;
        throw new Error(`Repositorio inesperado: ${entity?.name}`);
      }),
    } as unknown as jest.Mocked<EntityManager>;
    pricingEngine = {
      calculatePrice: jest.fn().mockResolvedValue({
        cpp: 18,
        recommendedPrice: 25,
        minAllowedPrice: 22.5,
        costSource: 'MOVEMENT_HISTORY',
      }),
    } as unknown as jest.Mocked<PricingEngineService>;
    service = new ServiceOrderInitialCommercialService(pricingEngine);
  });

  it('crea versiones aceptadas por equipo y un consolidado confirmado', async () => {
    productRepo.find.mockResolvedValue([{ id: 12, sku: 'RAM-16', name: 'Memoria 16 GB', description: 'DDR4' }]);
    versionRepo.save
      .mockResolvedValueOnce({ id: 201, serviceOrderItemId: 11 })
      .mockResolvedValueOnce({ id: 202, serviceOrderItemId: 12 });
    agreementRepo.save.mockResolvedValue({ id: 301 });
    const items = [{ id: 11 }, { id: 12 }] as ServiceOrderItem[];
    const inputs: CreateServiceOrderItemDto[] = [
      {
        equipmentType: EquipmentType.LAPTOP,
        initialIssue: 'No enciende',
        initialCommercial: {
          lines: [
            { type: ServiceOrderCommercialLineType.SERVICE, quantity: 1, unitPrice: 80 },
            { type: ServiceOrderCommercialLineType.PRODUCT, productId: 12, quantity: 2, unitPrice: 25 },
          ],
        },
      },
      {
        equipmentType: EquipmentType.PRINTER,
        initialIssue: 'Atasca papel',
        initialCommercial: {
          lines: [{ type: ServiceOrderCommercialLineType.SERVICE, quantity: 1, unitPrice: 60 }],
        },
      },
    ];

    await service.createForDirectService(
      manager,
      { id: 100, serviceType: ServiceType.STANDARD_SERVICE } as ServiceOrder,
      items,
      inputs,
      5,
    );

    expect(versionRepo.save).toHaveBeenCalledTimes(2);
    expect(lineRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ catalogCodeSnapshot: 'RAM-16', netAmount: 50 }),
        expect.objectContaining({ catalogCodeSnapshot: 'TECHNICAL_SERVICE', netAmount: 80 }),
      ]),
    );
    expect(agreementRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ serviceOrderId: 100, totalAmount: 190, agreedByUserId: 5 }),
    );
    expect(agreementItemRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ serviceOrderItemId: 11, commercialVersionId: 201 }),
      expect.objectContaining({ serviceOrderItemId: 12, commercialVersionId: 202 }),
    ]);
  });

  it('rechaza un servicio directo si algún equipo no tiene comercial inicial', async () => {
    await expect(
      service.createForDirectService(
        manager,
        { id: 100, serviceType: ServiceType.STANDARD_SERVICE } as ServiceOrder,
        [{ id: 11 }] as ServiceOrderItem[],
        [{ equipmentType: EquipmentType.LAPTOP, initialIssue: 'No enciende' }],
        5,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(versionRepo.save).not.toHaveBeenCalled();
  });
});
