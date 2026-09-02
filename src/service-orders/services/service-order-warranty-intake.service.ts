import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ADMIN_ROLE_NAMES, hasRoleName } from '../../common/constants/role-names';
import { JwtPayload } from '../../common/utils/jwt-payload.type';
import { WarrantiesService } from '../../warranties/warranties.service';
import { WarrantySourceType } from '../../warranties/enums/warranty-source-type.enum';
import { resolveWarrantyTechnician } from '../../warranties/warranty-policy';
import { CreateServiceOrderAggregateDto } from '../dto/create-service-order-aggregate.dto';
import { CreateWarrantyIntakeDto } from '../dto/create-warranty-intake.dto';
import { ServiceOrder } from '../entities/service-order.entity';
import { RequestOrigin, ServiceOrderEconomicStatus, ServiceType } from '../enums';
import { ServiceOrderAggregateService } from './service-order-aggregate.service';
import { ServiceOrderWorkflowService } from './service-order-workflow.service';

type WarrantyIntakeViewer = Pick<JwtPayload, 'sub' | 'roles'>;

@Injectable()
export class ServiceOrderWarrantyIntakeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly warrantiesService: WarrantiesService,
    private readonly aggregateService: ServiceOrderAggregateService,
    private readonly workflowService: ServiceOrderWorkflowService,
  ) {}

  async create(dto: CreateWarrantyIntakeDto, viewer: WarrantyIntakeViewer): Promise<ServiceOrder> {
    const actorId = Number(viewer.sub);
    if (!actorId) throw new BadRequestException('Usuario autenticado no encontrado');

    const order = await this.dataSource.transaction(async (manager) => {
      const { coverage, claim } = await this.warrantiesService.reserveCoverage(
        manager,
        dto.coverageId,
        dto.reportedIssue,
        actorId,
      );
      const suggestion = coverage.sourceType === WarrantySourceType.PRODUCT
        ? await this.workflowService.getAssignmentSuggestion(ServiceType.WARRANTY_SERVICE, manager)
        : null;
      const assignment = resolveWarrantyTechnician({
        sourceType: coverage.sourceType,
        originTechnicianId: coverage.originTechnicianId,
        suggestedTechnicianId: suggestion?.suggestedTechnicianId,
        requestedTechnicianId: dto.assignedToTechnicianId,
        isAdmin: hasRoleName(viewer.roles, ADMIN_ROLE_NAMES),
        overrideReason: dto.technicianOverrideReason,
      });

      const sourceItem = coverage.serviceOrderItem;
      const equipmentType = sourceItem?.equipmentType ?? dto.equipmentType;
      if (!equipmentType) {
        throw new BadRequestException('Debes indicar el tipo de equipo para la garantía del producto');
      }

      const aggregateDto: CreateServiceOrderAggregateDto = {
        requestOrigin: RequestOrigin.CLIENT,
        clientId: coverage.customerId,
        assignedToTechnicianId: assignment.technicianId,
        serviceType: ServiceType.WARRANTY_SERVICE,
        notes: dto.notes,
        items: [{
          equipmentType,
          equipmentTypeOther: sourceItem?.equipmentTypeOther ?? dto.equipmentTypeOther,
          brand: sourceItem?.brand ?? dto.brand ?? coverage.product?.brand ?? undefined,
          model: sourceItem?.model ?? dto.model ?? coverage.sourceNameSnapshot,
          serialNumber: sourceItem?.serialNumber ?? dto.serialNumber ?? coverage.serialSnapshot ?? undefined,
          accessories: sourceItem?.accessories ?? dto.accessories,
          initialIssue: dto.reportedIssue,
          priority: dto.priority,
          notes: dto.notes,
          warrantySourceItemId: coverage.serviceOrderItemId ?? undefined,
        }],
      };
      const created = await this.aggregateService.createInTransaction(manager, aggregateDto, actorId);
      created.warrantyClaimId = claim.id;
      created.economicStatus = ServiceOrderEconomicStatus.EXONERADO;
      await manager.getRepository(ServiceOrder).save(created);
      const createdItemId = created.items?.[0]?.id;
      if (!createdItemId) throw new BadRequestException('No se pudo crear el equipo de la garantía');
      await this.warrantiesService.linkClaimToOrder(
        manager,
        claim.id,
        created.id,
        createdItemId,
        assignment.technicianId,
        assignment.overridden ? dto.technicianOverrideReason : undefined,
      );
      return created;
    });

    await this.aggregateService.notifyCreated(order);
    return order;
  }
}
