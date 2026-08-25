import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItemCancellationRequest } from '../entities/service-order-item-cancellation-request.entity';
import { ServiceOrderEvent } from '../entities/service-order-event.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderSaleLink } from '../entities/service-order-sale-link.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import {
  ServiceOrderCommercialStatus,
  ServiceOrderCancellationResolution,
  ServiceOrderCancellationStatus,
  ServiceOrderOperativeStatus,
  ServiceOrderEconomicStatus,
  ServiceOrderTechnicalStatus,
} from '../enums';
import { ServiceOrderAggregateProjectionService } from '../services/service-order-aggregate-projection.service';
import { ServiceOrderAgreementItem } from './entities/service-agreement-item.entity';
import { ServiceOrderAgreement } from './entities/service-agreement.entity';
import { ServiceOrderClientDecision } from './entities/service-order-client-decision.entity';
import { ServiceOrderAgreementStatus } from './service-agreement-status.enum';
import { ServiceOrderClientDecisionChannel } from './service-order-client-decision-channel.enum';
import { ServiceOrderClientDecisionType } from './service-order-client-decision-type.enum';
import { ServiceOrderCommercialDecisionService } from './service-order-commercial-decision.service';
import { ServiceOrderItemCommercialVersionStatus } from './service-order-item-commercial-version-status.enum';

const createRepo = () => {
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
};

describe('ServiceOrderCommercialDecisionService', () => {
  let service: ServiceOrderCommercialDecisionService;
  let manager: jest.Mocked<EntityManager>;
  let versionRepo: ReturnType<typeof createRepo>;
  let decisionRepo: ReturnType<typeof createRepo>;
  let agreementItemRepo: ReturnType<typeof createRepo>;
  let agreementRepo: ReturnType<typeof createRepo>;
  let itemRepo: ReturnType<typeof createRepo>;
  let orderRepo: ReturnType<typeof createRepo>;
  let cancellationRepo: ReturnType<typeof createRepo>;
  let saleLinkRepo: ReturnType<typeof createRepo>;
  let eventRepo: ReturnType<typeof createRepo>;
  let projection: jest.Mocked<ServiceOrderAggregateProjectionService>;

  beforeEach(() => {
    versionRepo = createRepo();
    decisionRepo = createRepo();
    agreementItemRepo = createRepo();
    agreementRepo = createRepo();
    itemRepo = createRepo();
    orderRepo = createRepo();
    cancellationRepo = createRepo();
    saleLinkRepo = createRepo();
    eventRepo = createRepo();
    cancellationRepo.findOne.mockResolvedValue(null);
    saleLinkRepo.find.mockResolvedValue([]);
    manager = {
      transaction: jest.fn(async (callback) => callback(manager)),
      getRepository: jest.fn((entity) => {
        if (entity === ServiceOrderItemCommercialVersion) return versionRepo;
        if (entity === ServiceOrderClientDecision) return decisionRepo;
        if (entity === ServiceOrderAgreementItem) return agreementItemRepo;
        if (entity === ServiceOrderAgreement) return agreementRepo;
        if (entity === ServiceOrderItem) return itemRepo;
        if (entity === ServiceOrder) return orderRepo;
        if (entity === ServiceOrderItemCancellationRequest)
          return cancellationRepo;
        if (entity === ServiceOrderSaleLink) return saleLinkRepo;
        if (entity === ServiceOrderEvent) return eventRepo;
        throw new Error(`Repositorio inesperado: ${entity?.name}`);
      }),
    } as unknown as jest.Mocked<EntityManager>;
    projection = {
      recalculateLocked: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderAggregateProjectionService>;
    service = new ServiceOrderCommercialDecisionService(manager, projection);
  });

  it('registra una aceptación append-only sin confirmar mientras otro equipo siga pendiente', async () => {
    const fixture = arrangeCurrentAgreement(false);

    const result = await service.recordDecision(
      {
        commercialVersionId: fixture.version.id,
        decision: ServiceOrderClientDecisionType.ACCEPTED,
        channel: ServiceOrderClientDecisionChannel.WHATSAPP,
        observation: 'Confirmado por el cliente en el inbox',
      },
      { sub: 9, roles: [{ name: 'technician' }] } as any,
    );

    expect(decisionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialVersionId: fixture.version.id,
        decision: ServiceOrderClientDecisionType.ACCEPTED,
        channel: ServiceOrderClientDecisionChannel.WHATSAPP,
        recordedByUserId: 9,
      }),
    );
    expect(versionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: fixture.version.id,
        status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
        acceptedByUserId: 9,
      }),
    );
    expect(itemRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialStatus: ServiceOrderCommercialStatus.AUTORIZADA,
      }),
    );
    expect(agreementRepo.save).not.toHaveBeenCalled();
    expect(result.agreement?.status).toBe(ServiceOrderAgreementStatus.DRAFT);
  });

  it('registra una aceptación directa de WhatsApp sin atribuirla a un operador', async () => {
    const fixture = arrangeCurrentAgreement(false);

    await service.recordWhatsAppAcceptance(fixture.version.id);

    expect(decisionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialVersionId: fixture.version.id,
        decision: ServiceOrderClientDecisionType.ACCEPTED,
        channel: ServiceOrderClientDecisionChannel.WHATSAPP,
        recordedByUserId: null,
      }),
    );
    expect(versionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: fixture.version.id,
        status: ServiceOrderItemCommercialVersionStatus.ACCEPTED,
        acceptedByUserId: null,
      }),
    );
  });

  it('confirma el consolidado y autoriza todos los equipos cuando se acepta la última versión pendiente', async () => {
    const fixture = arrangeCurrentAgreement(true);

    const result = await service.recordDecision(
      {
        commercialVersionId: fixture.version.id,
        decision: ServiceOrderClientDecisionType.ACCEPTED,
        channel: ServiceOrderClientDecisionChannel.IN_PERSON,
      },
      { sub: 21, roles: [{ name: 'recepcionist' }] } as any,
    );

    expect(agreementRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ServiceOrderAgreementStatus.CONFIRMED,
        agreedByUserId: 21,
      }),
    );
    expect(fixture.item.technicalStatus).toBe(
      ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
    );
    expect(fixture.siblingItem.technicalStatus).toBe(
      ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION,
    );
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: fixture.order.id,
        economicStatus: ServiceOrderEconomicStatus.PENDIENTE,
        montoComprometidoVigente: 175.5,
      }),
    );
    expect(projection.recalculateLocked).toHaveBeenCalledWith(
      manager,
      fixture.order.id,
    );
    expect(result.allAccepted).toBe(true);
  });

  it('registra solicitud de cambios sin mutar ni enviar mensajes y deja el item rechazado', async () => {
    const fixture = arrangeCurrentAgreement(false);

    const result = await service.recordDecision(
      {
        commercialVersionId: fixture.version.id,
        decision: ServiceOrderClientDecisionType.CHANGES_REQUESTED,
        channel: ServiceOrderClientDecisionChannel.PHONE,
        observation: 'Solicita retirar el repuesto',
      },
      { sub: 9, roles: [{ name: 'technician' }] } as any,
    );

    expect(fixture.version.status).toBe(
      ServiceOrderItemCommercialVersionStatus.DRAFT,
    );
    expect(fixture.item.commercialStatus).toBe(
      ServiceOrderCommercialStatus.RECHAZADA,
    );
    expect(agreementRepo.save).not.toHaveBeenCalled();
    expect(result.allAccepted).toBe(false);
  });

  it('finaliza la cancelación con cobro solo cuando el cliente acepta el ajuste', async () => {
    const fixture = arrangeCurrentAgreement(true);
    fixture.item.operativeStatus =
      ServiceOrderOperativeStatus.CANCELACION_SOLICITADA;
    const cancellationRequest = {
      id: 1201,
      serviceOrderItemId: fixture.item.id,
      commercialVersionId: fixture.version.id,
      status: ServiceOrderCancellationStatus.AWAITING_CLIENT_ACCEPTANCE,
      resolution: ServiceOrderCancellationResolution.APPROVED_WITH_CHARGE,
      reason: 'Cliente solicitó detener el trabajo.',
      resolutionReason: 'Cargo por trabajo realizado.',
      chargeAmount: 45.5,
      resolvedAt: null,
    } as ServiceOrderItemCancellationRequest;
    cancellationRepo.findOne.mockResolvedValue(cancellationRequest);

    const result = await service.recordDecision(
      {
        commercialVersionId: fixture.version.id,
        decision: ServiceOrderClientDecisionType.ACCEPTED,
        channel: ServiceOrderClientDecisionChannel.WHATSAPP,
        observation: 'El cliente aceptó el cargo.',
      },
      { sub: 21, roles: [{ name: 'recepcionist' }] } as any,
    );

    expect(cancellationRequest.status).toBe(
      ServiceOrderCancellationStatus.APPROVED,
    );
    expect(cancellationRequest.resolvedAt).toBeInstanceOf(Date);
    expect(fixture.item.operativeStatus).toBe(
      ServiceOrderOperativeStatus.CANCELADA,
    );
    expect(fixture.item.cancelledAt).toBeInstanceOf(Date);
    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'item.cancellation.charge-accepted',
      }),
    );
    expect(result.allAccepted).toBe(true);
  });

  it('mantiene pendiente la cancelación con cobro si el cliente solicita cambios', async () => {
    const fixture = arrangeCurrentAgreement(true);
    fixture.item.operativeStatus =
      ServiceOrderOperativeStatus.CANCELACION_SOLICITADA;
    const cancellationRequest = {
      id: 1201,
      serviceOrderItemId: fixture.item.id,
      commercialVersionId: fixture.version.id,
      status: ServiceOrderCancellationStatus.AWAITING_CLIENT_ACCEPTANCE,
      resolution: ServiceOrderCancellationResolution.APPROVED_WITH_CHARGE,
      reason: 'Cliente solicitó detener el trabajo.',
    } as ServiceOrderItemCancellationRequest;
    cancellationRepo.findOne.mockResolvedValue(cancellationRequest);

    await service.recordDecision(
      {
        commercialVersionId: fixture.version.id,
        decision: ServiceOrderClientDecisionType.CHANGES_REQUESTED,
        channel: ServiceOrderClientDecisionChannel.PHONE,
        observation: 'Solicita reducir el cargo.',
      },
      { sub: 21, roles: [{ name: 'recepcionist' }] } as any,
    );

    expect(cancellationRequest.status).toBe(
      ServiceOrderCancellationStatus.PENDING,
    );
    expect(fixture.item.operativeStatus).toBe(
      ServiceOrderOperativeStatus.CANCELACION_SOLICITADA,
    );
    expect(fixture.item.cancelledAt).toBeUndefined();
  });

  it('bloquea la aceptación del cargo mientras exista una venta confirmada', async () => {
    const fixture = arrangeCurrentAgreement(true);
    fixture.item.operativeStatus =
      ServiceOrderOperativeStatus.CANCELACION_SOLICITADA;
    cancellationRepo.findOne.mockResolvedValue({
      id: 1201,
      commercialVersionId: fixture.version.id,
      status: ServiceOrderCancellationStatus.AWAITING_CLIENT_ACCEPTANCE,
    });
    saleLinkRepo.find.mockResolvedValue([{ sale: { status: 'CONFIRMED' } }]);

    await expect(
      service.recordDecision(
        {
          commercialVersionId: fixture.version.id,
          decision: ServiceOrderClientDecisionType.ACCEPTED,
          channel: ServiceOrderClientDecisionChannel.WHATSAPP,
        },
        { sub: 21, roles: [{ name: 'recepcionist' }] } as any,
      ),
    ).rejects.toThrow('venta confirmada');

    expect(fixture.item.operativeStatus).toBe(
      ServiceOrderOperativeStatus.CANCELACION_SOLICITADA,
    );
  });

  it('rechaza una versión que no pertenece al consolidado vigente', async () => {
    const fixture = arrangeCurrentAgreement(false);
    agreementItemRepo.find.mockResolvedValue([]);

    await expect(
      service.recordDecision({
        commercialVersionId: fixture.version.id,
        decision: ServiceOrderClientDecisionType.ACCEPTED,
        channel: ServiceOrderClientDecisionChannel.EMAIL,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('impide que un técnico registre decisiones de una orden asignada a otro técnico', async () => {
    const fixture = arrangeCurrentAgreement(false);

    await expect(
      service.recordDecision(
        {
          commercialVersionId: fixture.version.id,
          decision: ServiceOrderClientDecisionType.ACCEPTED,
          channel: ServiceOrderClientDecisionChannel.OTHER,
        },
        { sub: 99, roles: [{ name: 'technician' }] } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  function arrangeCurrentAgreement(siblingAccepted: boolean) {
    const order = {
      id: 70,
      assignedToTechnicianId: 9,
      economicStatus: ServiceOrderEconomicStatus.NO_APLICA,
      montoComprometidoVigente: 0,
    } as ServiceOrder;
    const item = {
      id: 701,
      serviceOrderId: order.id,
      serviceOrder: order,
      operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
      technicalStatus:
        ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL,
      commercialStatus:
        ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE,
    } as ServiceOrderItem;
    const siblingItem = {
      id: 702,
      serviceOrderId: order.id,
      serviceOrder: order,
      operativeStatus: ServiceOrderOperativeStatus.EN_PROCESO,
      technicalStatus:
        ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL,
      commercialStatus: siblingAccepted
        ? ServiceOrderCommercialStatus.AUTORIZADA
        : ServiceOrderCommercialStatus.PENDIENTE_RESPUESTA_CLIENTE,
    } as ServiceOrderItem;
    const version = {
      id: 801,
      serviceOrderItemId: item.id,
      serviceOrderItem: item,
      status: ServiceOrderItemCommercialVersionStatus.DRAFT,
    } as ServiceOrderItemCommercialVersion;
    const siblingVersion = {
      id: 802,
      serviceOrderItemId: siblingItem.id,
      serviceOrderItem: siblingItem,
      status: siblingAccepted
        ? ServiceOrderItemCommercialVersionStatus.ACCEPTED
        : ServiceOrderItemCommercialVersionStatus.DRAFT,
    } as ServiceOrderItemCommercialVersion;
    const agreement = {
      id: 900,
      serviceOrderId: order.id,
      sequenceNumber: 3,
      status: ServiceOrderAgreementStatus.DRAFT,
      totalAmount: 175.5,
      items: [],
    } as unknown as ServiceOrderAgreement;
    const links = [
      {
        id: 910,
        serviceOrderAgreementId: agreement.id,
        serviceOrderItemId: item.id,
        commercialVersionId: version.id,
        serviceOrderAgreement: agreement,
        commercialVersion: version,
        serviceOrderItem: item,
      },
      {
        id: 911,
        serviceOrderAgreementId: agreement.id,
        serviceOrderItemId: siblingItem.id,
        commercialVersionId: siblingVersion.id,
        serviceOrderAgreement: agreement,
        commercialVersion: siblingVersion,
        serviceOrderItem: siblingItem,
      },
    ] as unknown as ServiceOrderAgreementItem[];
    agreement.items = links;

    versionRepo.findOne.mockResolvedValue(version);
    agreementItemRepo.find.mockResolvedValue([links[0]]);
    agreementRepo.findOne.mockResolvedValue(agreement);
    projection.recalculateLocked.mockResolvedValue(order);
    decisionRepo.save.mockImplementation(async (value) => ({
      id: 1001,
      ...value,
    }));

    return { order, item, siblingItem, version, siblingVersion, agreement };
  }
});
