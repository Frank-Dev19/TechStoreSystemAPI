import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationDeliveryAttempt } from '../entities/notification-delivery-attempt.entity';
import { NotificationMessage } from '../entities/notification-message.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderOperativeStatus, ServiceOrderTechnicalStatus } from '../enums';
import { ServiceOrderDiagnosis } from '../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderDiagnosisOutcome } from '../diagnoses/service-order-diagnosis-outcome.enum';
import { ServiceOrderInboxChannelService } from '../inbox/service-order-inbox-channel.service';
import { ServiceOrderInboxService } from '../inbox/service-order-inbox.service';
import { Sale } from '../../sales/entities/sale.entity';
import { ServiceOrderWhatsAppTemplateService, WhatsAppTemplateDispatch } from './service-order-whatsapp-template.service';

type DispatchMessageInput = {
  serviceOrder: ServiceOrder;
  idempotencyKey: string;
  messageType: string;
  body: string | null;
};

type DispatchOrderIntakeTemplateInput = {
  serviceOrders: ServiceOrder[];
  documentUrl: string;
  documentFileName: string;
  tempDocumentToken: string;
};

type DispatchBusinessNotificationInput = {
  serviceOrder: ServiceOrder;
  idempotencyKey: string;
  messageType: string;
  freeTextBody?: string | null;
  template?: WhatsAppTemplateDispatch | null;
  preferFreeTextWhenWindowOpen?: boolean;
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
    private readonly inboxChannelService: ServiceOrderInboxChannelService,
    private readonly whatsappTemplateService: ServiceOrderWhatsAppTemplateService,
  ) {}

  async dispatchOrderIntakeTemplate(input: DispatchOrderIntakeTemplateInput): Promise<void> {
    const serviceOrders = input.serviceOrders.filter(Boolean);
    if (!serviceOrders.length) {
      return;
    }

    const thread = await this.inboxService.getThreadForServiceOrder(serviceOrders[0].id, {
      role: 'SUPERVISOR',
      userId: null,
      displayName: 'Sistema',
    });
    const recipient = thread.clientPhone ?? serviceOrders[0].clientSnapshotPhone ?? null;
    if (!recipient) {
      return;
    }

    const idempotencyKey = `service_order:${serviceOrders.map((order) => order.id).join('-')}:intake-template`;
    const existing = await this.notificationRepository.findOne({
      where: { idempotencyKey },
    });
    if (existing) {
      return;
    }

    const descriptor = serviceOrders.length === 1 ? 'tu orden de servicio' : 'tus órdenes de servicio';
    const allStandard = serviceOrders.every((order) => order.serviceType === 'STANDARD_SERVICE');
    const template = allStandard
      ? this.whatsappTemplateService.buildStandardOrderConfirmedTemplate({
          clientName: serviceOrders[0].clientSnapshotName?.trim() || 'cliente',
          orderDescriptor: descriptor,
          documentUrl: input.documentUrl,
          documentFileName: input.documentFileName,
          quickReplyPayloads: ['ENTENDIDO', 'CONSULTA'],
        })
      : this.whatsappTemplateService.buildOrderIntakeTemplate({
        clientName: serviceOrders[0].clientSnapshotName?.trim() || 'cliente',
        orderDescriptor: descriptor,
        documentUrl: input.documentUrl,
        documentFileName: input.documentFileName,
        quickReplyPayloads: ['ENTENDIDO', 'CONSULTA'],
      });

    const notification = await this.notificationRepository.save(
      this.notificationRepository.create({
        serviceOrderId: serviceOrders.length === 1 ? serviceOrders[0].id : null,
        channel: 'WHATSAPP_TEMPLATE',
        messageType: 'order.intake.summary',
        recipient,
        body: `Template ${template.templateName}`,
        idempotencyKey,
        status: 'QUEUED',
        scope: serviceOrders.length === 1 ? 'ORDER' : 'ORDER_BATCH',
        metadataJson: JSON.stringify({
          orderIds: serviceOrders.map((order) => order.id),
          tempDocumentToken: input.tempDocumentToken,
          templateName: template.templateName,
        }),
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
      const result = await this.inboxChannelService.dispatchTemplateMessage({
        clientPhone: recipient,
        templateName: template.templateName,
        languageCode: template.languageCode,
        documentUrl: template.documentUrl,
        documentFileName: template.documentFileName,
        bodyParameters: template.bodyParameters,
        quickReplyPayloads: template.quickReplyPayloads,
        contextToken: thread.contextToken,
      });
      notification.status = result.status;
      attempt.status = result.status;
      attempt.responsePayload = JSON.stringify(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown dispatch error';
      notification.status = 'FAILED';
      attempt.status = 'FAILED';
      attempt.responsePayload = JSON.stringify({ error: message });
      this.logger.error(`Batch intake template dispatch failed for orders ${serviceOrders.map((order) => order.id).join(', ')}: ${message}`);
    }

    await this.notificationRepository.save(notification);
    await this.attemptRepository.save(attempt);
  }

  async notifyInitialAssignment(serviceOrder: ServiceOrder): Promise<void> {
    return;
  }

  async notifyTechnicianReassignment(
    serviceOrder: ServiceOrder,
    nextTechnicianName: string | null,
  ): Promise<void> {
    return;
  }

  async notifyWorkflowTransition(
    serviceOrder: ServiceOrder,
    nextTechnicalStatus: ServiceOrderTechnicalStatus,
  ): Promise<void> {
    switch (nextTechnicalStatus) {
      case ServiceOrderTechnicalStatus.AUTORIZADA_PARA_EJECUCION:
        await this.dispatchBusinessNotification({
          serviceOrder,
          messageType: 'authorization.confirmed',
          idempotencyKey: `service_order:${serviceOrder.id}:authorization:confirmed`,
          freeTextBody: `Tu orden ${serviceOrder.code} ya quedó autorizada para ejecución. Continuaremos con la atención del equipo.`,
          template: this.whatsappTemplateService.buildAuthorizationConfirmedTemplate({
            clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
            equipmentLabel: this.buildEquipmentLabel(serviceOrder),
            orderCode: serviceOrder.code,
          }),
          preferFreeTextWhenWindowOpen: true,
        });
        return;
      case ServiceOrderTechnicalStatus.RESUELTA:
        await this.dispatchBusinessNotification({
          serviceOrder,
          messageType: 'ready.for.pickup',
          idempotencyKey: `service_order:${serviceOrder.id}:ready-for-pickup`,
          freeTextBody: `Tu orden ${serviceOrder.code} ya quedó finalizada y lista para entrega o recojo.`,
          template: this.whatsappTemplateService.buildReadyForPickupTemplate({
            clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
            orderCode: serviceOrder.code,
            equipmentLabel: this.buildEquipmentLabel(serviceOrder),
          }),
          preferFreeTextWhenWindowOpen: true,
        });
        return;
      case ServiceOrderTechnicalStatus.SIN_SOLUCION:
        await this.dispatchBusinessNotification({
          serviceOrder,
          messageType: 'no.solution',
          idempotencyKey: `service_order:${serviceOrder.id}:no-solution`,
          freeTextBody: `Tu orden ${serviceOrder.code} no tiene una solución técnica viable. Si necesitas más detalle, podemos ayudarte por este mismo canal.`,
          template: this.whatsappTemplateService.buildNoSolutionTemplate({
            clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
            orderCode: serviceOrder.code,
            equipmentLabel: this.buildEquipmentLabel(serviceOrder),
          }),
          preferFreeTextWhenWindowOpen: true,
        });
        return;
      case ServiceOrderTechnicalStatus.BLOQUEADA:
      case ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO:
        await this.dispatchBusinessNotification({
          serviceOrder,
          messageType: 'pause.blocked',
          idempotencyKey: `service_order:${serviceOrder.id}:pause:${nextTechnicalStatus}`,
          freeTextBody: `Tu orden ${serviceOrder.code} requiere una gestión adicional antes de continuar. Te avisaremos cuando retomemos la atención.`,
          template: this.whatsappTemplateService.buildPauseOrBlockedTemplate({
            clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
            orderCode: serviceOrder.code,
            equipmentLabel: this.buildEquipmentLabel(serviceOrder),
          }),
          preferFreeTextWhenWindowOpen: true,
        });
        return;
      default:
        return;
    }
  }

  async notifyDiagnosisUpdated(
    serviceOrder: ServiceOrder,
    diagnosis: ServiceOrderDiagnosis,
    previousDiagnosis: ServiceOrderDiagnosis | null,
  ): Promise<void> {
    if (!this.isDiagnosisMaterialChange(diagnosis, previousDiagnosis)) {
      return;
    }

    if (
      [ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES, ServiceOrderDiagnosisOutcome.WARRANTY_REJECTED].includes(
        diagnosis.outcome,
      )
    ) {
      const statusLabel =
        diagnosis.outcome === ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES
          ? 'aprobada'
          : 'rechazada';
      await this.dispatchBusinessNotification({
        serviceOrder,
        messageType: 'warranty.status',
        idempotencyKey: `service_order:${serviceOrder.id}:warranty:${diagnosis.id}:${diagnosis.outcome}`,
        template: this.whatsappTemplateService.buildWarrantyStatusTemplate({
          clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
          orderCode: serviceOrder.code,
          statusLabel,
        }),
        freeTextBody:
          diagnosis.outcome === ServiceOrderDiagnosisOutcome.WARRANTY_APPLIES
            ? `Tu orden ${serviceOrder.code} califica para atención por garantía.`
            : `La garantía de tu orden ${serviceOrder.code} fue rechazada.`,
        preferFreeTextWhenWindowOpen: true,
      });
    }
  }

  async notifyAgreementConfirmed(serviceOrder: ServiceOrder, agreementId: number): Promise<void> {
    await this.dispatchBusinessNotification({
      serviceOrder,
      messageType: 'authorization.confirmed',
      idempotencyKey: `service_order:${serviceOrder.id}:agreement:${agreementId}:confirmed`,
      freeTextBody: `Tu orden ${serviceOrder.code} ya tiene el acuerdo confirmado. Continuaremos con la atención del equipo y te avisaremos cuando haya una nueva etapa relevante.`,
      template: this.whatsappTemplateService.buildAuthorizationConfirmedTemplate({
        clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
        orderCode: serviceOrder.code,
        equipmentLabel: this.buildEquipmentLabel(serviceOrder),
      }),
      preferFreeTextWhenWindowOpen: true,
    });
  }

  async notifyInvoiceLinked(serviceOrder: ServiceOrder, sale: Sale): Promise<void> {
    return;
  }

  async notifySurveyRequest(serviceOrder: ServiceOrder): Promise<void> {
    const hasWindow = await this.inboxService.hasCustomerServiceWindow(serviceOrder.id);
    if (!hasWindow) {
      return;
    }

    await this.dispatchMessage({
      serviceOrder,
      messageType: 'survey.requested',
      idempotencyKey: `service_order:${serviceOrder.id}:survey:delivered`,
      body: `Gracias por confiar en nosotros. Tu orden ${serviceOrder.code} fue entregada. Si deseas calificarnos, responde con una nota del 1 al 5 y, si quieres, un comentario breve sobre la atención.`,
    });
  }

  async notifyAgreementAvailable(
    serviceOrder: ServiceOrder,
    agreementId: number,
    totalAmount: number,
  ): Promise<void> {
    await this.dispatchBusinessNotification({
      serviceOrder,
      messageType: 'agreement.available',
      idempotencyKey: `service_order:${serviceOrder.id}:agreement:${agreementId}:available`,
      freeTextBody: `Ya tenemos el acuerdo comercial de tu orden ${serviceOrder.code} por un total de S/${Number(totalAmount).toFixed(2)}.`,
      template: this.whatsappTemplateService.buildDiagnosisAgreementAvailableTemplate({
        clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
        equipmentLabel: this.buildEquipmentLabel(serviceOrder),
        orderCode: serviceOrder.code,
        totalAmount: `S/${Number(totalAmount).toFixed(2)}`,
      }),
      preferFreeTextWhenWindowOpen: false,
    });
  }

  async notifyRediagnosisAgreementAvailable(
    serviceOrder: ServiceOrder,
    agreementId: number,
    totalAmount: number,
  ): Promise<void> {
    await this.dispatchBusinessNotification({
      serviceOrder,
      messageType: 'agreement.available.rediagnosis',
      idempotencyKey: `service_order:${serviceOrder.id}:agreement:${agreementId}:rediagnosis`,
      freeTextBody: `Actualizamos el acuerdo comercial de tu orden ${serviceOrder.code}. Nuevo total: S/${Number(totalAmount).toFixed(2)}.`,
      template: this.whatsappTemplateService.buildRediagnosisAgreementTemplate({
        clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
        equipmentLabel: this.buildEquipmentLabel(serviceOrder),
        orderCode: serviceOrder.code,
        totalAmount: `S/${Number(totalAmount).toFixed(2)}`,
      }),
      preferFreeTextWhenWindowOpen: false,
    });
  }

  async notifyCancellationWithDiagnosisFee(serviceOrder: ServiceOrder): Promise<void> {
    await this.dispatchBusinessNotification({
      serviceOrder,
      messageType: 'cancellation.with.fee',
      idempotencyKey: `service_order:${serviceOrder.id}:cancellation:diagnosis-fee`,
      freeTextBody: `La orden ${serviceOrder.code} fue cancelada y corresponde el cobro de S/20 por el diagnóstico realizado.`,
      template: this.whatsappTemplateService.buildCancellationWithFeeTemplate({
        clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
        orderCode: serviceOrder.code,
        equipmentLabel: this.buildEquipmentLabel(serviceOrder),
      }),
      preferFreeTextWhenWindowOpen: false,
    });
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

  private async dispatchBusinessNotification(input: DispatchBusinessNotificationInput): Promise<void> {
    const hasWindow =
      input.preferFreeTextWhenWindowOpen !== false &&
      !!input.freeTextBody &&
      (await this.inboxService.hasCustomerServiceWindow(input.serviceOrder.id));

    if (hasWindow && input.freeTextBody) {
      await this.dispatchMessage({
        serviceOrder: input.serviceOrder,
        idempotencyKey: input.idempotencyKey,
        messageType: input.messageType,
        body: input.freeTextBody,
      });
      return;
    }

    if (!input.template) {
      if (input.freeTextBody) {
        await this.dispatchMessage({
          serviceOrder: input.serviceOrder,
          idempotencyKey: input.idempotencyKey,
          messageType: input.messageType,
          body: input.freeTextBody,
        });
      }
      return;
    }

    await this.dispatchTemplateNotification(input.serviceOrder, input.idempotencyKey, input.messageType, input.template);
  }

  private async dispatchTemplateNotification(
    serviceOrder: ServiceOrder,
    idempotencyKey: string,
    messageType: string,
    template: WhatsAppTemplateDispatch,
  ): Promise<void> {
    const existing = await this.notificationRepository.findOne({
      where: { idempotencyKey },
    });
    if (existing) {
      return;
    }

    const thread = await this.inboxService.getThreadForServiceOrder(serviceOrder.id, {
      role: 'SUPERVISOR',
      userId: null,
      displayName: 'Sistema',
    });
    const recipient = thread.clientPhone ?? serviceOrder.clientSnapshotPhone ?? null;
    if (!recipient) {
      return;
    }

    const notification = await this.notificationRepository.save(
      this.notificationRepository.create({
        serviceOrderId: serviceOrder.id,
        channel: 'WHATSAPP_TEMPLATE',
        messageType,
        recipient,
        body: `Template ${template.templateName}`,
        idempotencyKey,
        status: 'QUEUED',
        scope: 'ORDER',
        metadataJson: JSON.stringify({ templateName: template.templateName }),
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
      const result = await this.inboxChannelService.dispatchTemplateMessage({
        clientPhone: recipient,
        templateName: template.templateName,
        languageCode: template.languageCode,
        documentUrl: template.documentUrl ?? null,
        documentFileName: template.documentFileName ?? null,
        bodyParameters: template.bodyParameters,
        quickReplyPayloads: template.quickReplyPayloads,
        contextToken: thread.contextToken,
      });
      notification.status = result.status;
      attempt.status = result.status;
      attempt.responsePayload = JSON.stringify(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown dispatch error';
      notification.status = 'FAILED';
      attempt.status = 'FAILED';
      attempt.responsePayload = JSON.stringify({ error: message });
      this.logger.error(`Template dispatch failed for order ${serviceOrder.id}: ${message}`);
    }

    await this.notificationRepository.save(notification);
    await this.attemptRepository.save(attempt);
  }

  private buildEquipmentLabel(serviceOrder: ServiceOrder): string {
    const parts = [
      serviceOrder.equipmentType === 'OTHER' ? serviceOrder.equipmentTypeOther : serviceOrder.equipmentType,
      serviceOrder.brand,
      serviceOrder.model,
    ]
      .map((piece) => String(piece ?? '').trim())
      .filter(Boolean);

    return parts.join(' | ') || 'Equipo';
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
