import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationDeliveryAttempt } from '../entities/notification-delivery-attempt.entity';
import { NotificationMessage } from '../entities/notification-message.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderOperativeStatus, ServiceOrderTechnicalStatus } from '../enums';
import { ServiceOrderDiagnosis } from '../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderDiagnosisOutcome } from '../diagnoses/service-order-diagnosis-outcome.enum';
import { ServiceOrderInboxService } from '../inbox/service-order-inbox.service';
import { Sale } from '../../sales/entities/sale.entity';

type DispatchMessageInput = {
  serviceOrder: ServiceOrder;
  idempotencyKey: string;
  messageType: string;
  body: string | null;
};

@Injectable()
export class ServiceOrderMessageMatrixService {
  private readonly logger = new Logger(ServiceOrderMessageMatrixService.name);

  constructor(
    @InjectRepository(NotificationMessage)
    private readonly notificationRepository: Repository<NotificationMessage>,
    @InjectRepository(NotificationDeliveryAttempt)
    private readonly attemptRepository: Repository<NotificationDeliveryAttempt>,
    private readonly inboxService: ServiceOrderInboxService,
  ) {}

  async notifyInitialAssignment(serviceOrder: ServiceOrder): Promise<void> {
    if (!serviceOrder.assignedToTechnicianId) {
      return;
    }

    await this.dispatchMessage({
      serviceOrder,
      messageType: 'assignment.initial',
      idempotencyKey: `service_order:${serviceOrder.id}:assignment:initial:${serviceOrder.assignedToTechnicianId}`,
      body: `Tu orden ${serviceOrder.code} ya fue asignada a un técnico y pronto iniciaremos la revisión del equipo.`,
    });
  }

  async notifyTechnicianReassignment(
    serviceOrder: ServiceOrder,
    nextTechnicianName: string | null,
  ): Promise<void> {
    const hasPriorContact = await this.inboxService.hasThreadActivity(serviceOrder.id);
    if (!hasPriorContact) {
      return;
    }

    const technicianLabel = nextTechnicianName?.trim() || 'un nuevo técnico';
    await this.dispatchMessage({
      serviceOrder,
      messageType: 'assignment.reassigned',
      idempotencyKey: `service_order:${serviceOrder.id}:assignment:reassigned:${serviceOrder.assignedToTechnicianId}`,
      body: `Tu orden ${serviceOrder.code} fue reasignada a ${technicianLabel}. El seguimiento de tu atención continúa por este mismo canal.`,
    });
  }

  async notifyWorkflowTransition(
    serviceOrder: ServiceOrder,
    nextTechnicalStatus: ServiceOrderTechnicalStatus,
  ): Promise<void> {
    const body = this.resolveWorkflowMessage(serviceOrder, nextTechnicalStatus);
    if (!body) {
      return;
    }

    await this.dispatchMessage({
      serviceOrder,
      messageType: `technical.${nextTechnicalStatus.toLowerCase()}`,
      idempotencyKey: `service_order:${serviceOrder.id}:technical:${nextTechnicalStatus}`,
      body,
    });
  }

  async notifyDiagnosisUpdated(
    serviceOrder: ServiceOrder,
    diagnosis: ServiceOrderDiagnosis,
    previousDiagnosis: ServiceOrderDiagnosis | null,
  ): Promise<void> {
    if (!this.isDiagnosisMaterialChange(diagnosis, previousDiagnosis)) {
      return;
    }

    const summary = this.normalizeForMessage(diagnosis.summary);
    let body = `Tenemos una actualización del diagnóstico de tu orden ${serviceOrder.code}.`;

    if (
      [
        ServiceOrderDiagnosisOutcome.IRREPARABLE,
        ServiceOrderDiagnosisOutcome.NOT_COST_EFFECTIVE,
        ServiceOrderDiagnosisOutcome.NO_PARTS_AVAILABLE,
        ServiceOrderDiagnosisOutcome.NO_FAULT_FOUND,
        ServiceOrderDiagnosisOutcome.WARRANTY_REJECTED,
      ].includes(diagnosis.outcome)
    ) {
      body = `${body} El resultado actual es: sin solución viable.`;
    } else if (diagnosis.outcome === ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES) {
      body = `${body} El equipo califica para atención por garantía.`;
    } else {
      body = `${body} Ya tenemos una evaluación técnica actualizada.`;
    }

    if (summary) {
      body = `${body} Resumen: ${summary}.`;
    }

    await this.dispatchMessage({
      serviceOrder,
      messageType: 'diagnosis.updated',
      idempotencyKey: `service_order:${serviceOrder.id}:diagnosis:${diagnosis.id}`,
      body,
    });
  }

  async notifyAgreementConfirmed(serviceOrder: ServiceOrder, agreementId: number): Promise<void> {
    await this.dispatchMessage({
      serviceOrder,
      messageType: 'agreement.confirmed',
      idempotencyKey: `service_order:${serviceOrder.id}:agreement:${agreementId}:confirmed`,
      body: `Tu orden ${serviceOrder.code} ya tiene el acuerdo confirmado. Continuaremos con la atención del equipo y te avisaremos cuando haya una nueva etapa relevante.`,
    });
  }

  async notifyInvoiceLinked(serviceOrder: ServiceOrder, sale: Sale): Promise<void> {
    await this.dispatchMessage({
      serviceOrder,
      messageType: 'invoice.linked',
      idempotencyKey: `service_order:${serviceOrder.id}:invoice:${sale.id}`,
      body: `Tu comprobante ${sale.documentType} ${sale.series}-${sale.number} ya fue ligado a la orden ${serviceOrder.code}. Si necesitas una copia, solicítala por este canal.`,
    });
  }

  async notifySurveyRequest(serviceOrder: ServiceOrder): Promise<void> {
    await this.dispatchMessage({
      serviceOrder,
      messageType: 'survey.requested',
      idempotencyKey: `service_order:${serviceOrder.id}:survey:delivered`,
      body: `Gracias por confiar en nosotros. Tu orden ${serviceOrder.code} fue entregada. Si deseas calificarnos, responde con una nota del 1 al 5 y, si quieres, un comentario breve sobre la atención.`,
    });
  }

  private resolveWorkflowMessage(
    serviceOrder: ServiceOrder,
    nextStatus: ServiceOrderTechnicalStatus,
  ): string | null {
    switch (nextStatus) {
      case ServiceOrderTechnicalStatus.EN_DIAGNOSTICO:
        return `Tu orden ${serviceOrder.code} ingresó a revisión técnica. Te avisaremos cuando tengamos un diagnóstico o una actualización importante.`;
      case ServiceOrderTechnicalStatus.EN_EJECUCION:
        return `Tu orden ${serviceOrder.code} ya ingresó a servicio. Estamos trabajando en tu equipo.`;
      case ServiceOrderTechnicalStatus.RESUELTA:
        if (serviceOrder.operativeStatus === ServiceOrderOperativeStatus.LISTA_PARA_ENTREGA || serviceOrder.serviceCompletedAt) {
          return `Tu orden ${serviceOrder.code} ya quedó finalizada y lista para entrega o recojo.`;
        }
        return `Tu orden ${serviceOrder.code} ya está lista para entrega o recojo.`;
      case ServiceOrderTechnicalStatus.SIN_SOLUCION:
        if (serviceOrder.operativeStatus === ServiceOrderOperativeStatus.CANCELADA) {
          return `Tu orden ${serviceOrder.code} fue cancelada. Si necesitas más detalle, podemos ayudarte por este mismo canal.`;
        }
        return `Tu orden ${serviceOrder.code} no tiene una solución técnica viable. Si necesitas más detalle, podemos ayudarte por este mismo canal.`;
      case ServiceOrderTechnicalStatus.BLOQUEADA:
      case ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO:
        return `Tu orden ${serviceOrder.code} requiere una gestión adicional antes de continuar. Te avisaremos cuando retomemos la atención.`;
      case ServiceOrderTechnicalStatus.PENDIENTE_DEFINICION_COMERCIAL:
        return `Tu orden ${serviceOrder.code} quedó pendiente de definición comercial. Te avisaremos cuando tengamos la propuesta correspondiente.`;
      case ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION:
        return `Tu orden ${serviceOrder.code} ya quedó autorizada para ejecución. Continuaremos con la atención del equipo.`;
      case ServiceOrderTechnicalStatus.ASIGNADA:
      case ServiceOrderTechnicalStatus.PENDIENTE_ASIGNACION:
      case ServiceOrderTechnicalStatus.DIAGNOSTICADA:
        return null;
      default:
        return null;
    }
  }

  private isDiagnosisMaterialChange(
    diagnosis: ServiceOrderDiagnosis,
    previousDiagnosis: ServiceOrderDiagnosis | null,
  ): boolean {
    if (!previousDiagnosis) {
      return true;
    }

    return (
      diagnosis.outcome !== previousDiagnosis.outcome ||
      this.normalizeComparableText(diagnosis.summary) !== this.normalizeComparableText(previousDiagnosis.summary) ||
      this.normalizeComparableText(diagnosis.recommendedAction) !==
        this.normalizeComparableText(previousDiagnosis.recommendedAction)
    );
  }

  private async dispatchMessage(input: DispatchMessageInput): Promise<void> {
    const body = input.body?.trim() || null;
    if (!body) {
      return;
    }

    const existing = await this.notificationRepository.findOne({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return;
    }

    const notification = await this.notificationRepository.save(
      this.notificationRepository.create({
        serviceOrderId: input.serviceOrder.id,
        channel: 'WHATSAPP_INBOX',
        messageType: input.messageType,
        recipient: input.serviceOrder.clientSnapshotPhone ?? null,
        body,
        idempotencyKey: input.idempotencyKey,
        status: 'QUEUED',
      }),
    );

    const attempt = await this.attemptRepository.save(
      this.attemptRepository.create({
        notificationMessageId: notification.id,
        status: 'QUEUED',
        responsePayload: null,
      }),
    );

    try {
      const result = await this.inboxService.sendSystemMessageForOrder(input.serviceOrder.id, body);
      notification.status = result.deliveryStatus;
      attempt.status = result.deliveryStatus;
      attempt.responsePayload = JSON.stringify(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown dispatch error';
      notification.status = 'FAILED';
      attempt.status = 'FAILED';
      attempt.responsePayload = JSON.stringify({ error: message });
      this.logger.error(`Automatic message dispatch failed for order ${input.serviceOrder.id}: ${message}`);
    }

    await this.notificationRepository.save(notification);
    await this.attemptRepository.save(attempt);
  }

  private normalizeComparableText(value: string | null | undefined): string {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private normalizeForMessage(value: string | null | undefined): string | null {
    const normalized = String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    return normalized || null;
  }
}
