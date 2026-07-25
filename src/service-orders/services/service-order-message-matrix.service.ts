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
  template: WhatsAppTemplateDispatch;
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
        body: null,
        idempotencyKey,
        status: 'QUEUED',
        scope: serviceOrders.length === 1 ? 'ORDER' : 'ORDER_BATCH',
        metadataJson: JSON.stringify({
          orderIds: serviceOrders.map((order) => order.id),
          tempDocumentToken: input.tempDocumentToken,
          templateName: template.templateName,
          languageCode: template.languageCode,
          bodyParameters: template.bodyParameters,
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
          template: this.whatsappTemplateService.buildAuthorizationConfirmedTemplate({
            clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
            equipmentLabel: this.buildEquipmentLabel(serviceOrder),
            orderCode: serviceOrder.code,
          }),
        });
        return;
      case ServiceOrderTechnicalStatus.RESUELTA:
        await this.dispatchBusinessNotification({
          serviceOrder,
          messageType: 'ready.for.pickup',
          idempotencyKey: `service_order:${serviceOrder.id}:ready-for-pickup`,
          template: this.whatsappTemplateService.buildReadyForPickupTemplate({
            clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
            orderCode: serviceOrder.code,
            equipmentLabel: this.buildEquipmentLabel(serviceOrder),
          }),
        });
        return;
      case ServiceOrderTechnicalStatus.SIN_SOLUCION:
        await this.dispatchBusinessNotification({
          serviceOrder,
          messageType: 'no.solution',
          idempotencyKey: `service_order:${serviceOrder.id}:no-solution`,
          template: this.whatsappTemplateService.buildNoSolutionTemplate({
            clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
            orderCode: serviceOrder.code,
            equipmentLabel: this.buildEquipmentLabel(serviceOrder),
          }),
        });
        return;
      case ServiceOrderTechnicalStatus.BLOQUEADA:
      case ServiceOrderTechnicalStatus.ESPERANDO_REPUESTOS_O_TERCERO:
        await this.dispatchBusinessNotification({
          serviceOrder,
          messageType: 'pause.blocked',
          idempotencyKey: `service_order:${serviceOrder.id}:pause:${nextTechnicalStatus}`,
          template: this.whatsappTemplateService.buildPauseOrBlockedTemplate({
            clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
            orderCode: serviceOrder.code,
            equipmentLabel: this.buildEquipmentLabel(serviceOrder),
          }),
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
      });
    }
  }

  async notifyAgreementConfirmed(serviceOrder: ServiceOrder, agreementId: number): Promise<void> {
    await this.dispatchBusinessNotification({
      serviceOrder,
      messageType: 'authorization.confirmed',
      idempotencyKey: `service_order:${serviceOrder.id}:agreement:${agreementId}:confirmed`,
      template: this.whatsappTemplateService.buildAuthorizationConfirmedTemplate({
        clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
        orderCode: serviceOrder.code,
        equipmentLabel: this.buildEquipmentLabel(serviceOrder),
      }),
    });
  }

  async notifyInvoiceLinked(serviceOrder: ServiceOrder, sale: Sale): Promise<void> {
    return;
  }

  async notifySurveyRequest(serviceOrder: ServiceOrder): Promise<void> {
    const template = this.whatsappTemplateService.buildSurveyRequestTemplate({
      clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
      orderCode: serviceOrder.code,
      equipmentLabel: this.buildEquipmentLabel(serviceOrder),
    });
    if (!template) {
      this.logger.warn(
        `Automatic survey notification skipped for order ${serviceOrder.id}: WHATSAPP_TEMPLATE_SURVEY_NAME is not configured`,
      );
      return;
    }

    await this.dispatchBusinessNotification({
      serviceOrder,
      messageType: 'survey.requested',
      idempotencyKey: `service_order:${serviceOrder.id}:survey:delivered`,
      template,
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
      template: this.whatsappTemplateService.buildDiagnosisAgreementAvailableTemplate({
        clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
        equipmentLabel: this.buildEquipmentLabel(serviceOrder),
        orderCode: serviceOrder.code,
        totalAmount: `S/${Number(totalAmount).toFixed(2)}`,
      }),
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
      template: this.whatsappTemplateService.buildRediagnosisAgreementTemplate({
        clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
        equipmentLabel: this.buildEquipmentLabel(serviceOrder),
        orderCode: serviceOrder.code,
        totalAmount: `S/${Number(totalAmount).toFixed(2)}`,
      }),
    });
  }

  async notifyCancellationWithDiagnosisFee(serviceOrder: ServiceOrder): Promise<void> {
    await this.dispatchBusinessNotification({
      serviceOrder,
      messageType: 'cancellation.with.fee',
      idempotencyKey: `service_order:${serviceOrder.id}:cancellation:diagnosis-fee`,
      template: this.whatsappTemplateService.buildCancellationWithFeeTemplate({
        clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
        orderCode: serviceOrder.code,
        equipmentLabel: this.buildEquipmentLabel(serviceOrder),
      }),
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

  private async dispatchBusinessNotification(input: DispatchBusinessNotificationInput): Promise<void> {
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
        body: null,
        idempotencyKey,
        status: 'QUEUED',
        scope: 'ORDER',
        metadataJson: JSON.stringify({
          templateName: template.templateName,
          languageCode: template.languageCode,
          bodyParameters: template.bodyParameters,
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

}
