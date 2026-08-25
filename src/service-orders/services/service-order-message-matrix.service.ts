import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { NotificationDeliveryAttempt } from '../entities/notification-delivery-attempt.entity';
import { NotificationMessage } from '../entities/notification-message.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderOperativeStatus, ServiceOrderTechnicalStatus } from '../enums';
import { ServiceOrderDiagnosis } from '../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderDiagnosisOutcome } from '../diagnoses/service-order-diagnosis-outcome.enum';
import { ServiceOrderInboxChannelService } from '../inbox/service-order-inbox-channel.service';
import { ServiceOrderInboxService } from '../inbox/service-order-inbox.service';
import { ServiceOrderWhatsAppTemplateService, WhatsAppTemplateDispatch } from './service-order-whatsapp-template.service';
import { ServiceOrderSurveyService } from '../surveys/service-order-survey.service';

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

type DispatchDiagnosisQuoteInput = {
  serviceOrder: ServiceOrder;
  commercialVersionId: number;
  equipmentLabel: string;
  totalAmount: number;
  documentUrl: string;
  documentFileName: string;
  tempDocumentToken: string;
  isRediagnosis?: boolean;
};

type DispatchCancellationSummaryInput = {
  serviceOrder: ServiceOrder;
  cancellationRequestIds: number[];
  itemCount: number;
  documentUrl: string;
  documentFileName: string;
  tempDocumentToken: string;
};

type DispatchFinalServiceReportInput = {
  serviceOrder: ServiceOrder;
  serviceOrderItemId: number;
  equipmentLabel: string;
  itemCode: string;
  documentUrl: string;
  documentFileName: string;
  tempDocumentToken: string;
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
    @Optional() private readonly surveyService?: ServiceOrderSurveyService,
    @Optional() private readonly configService?: ConfigService,
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
          documentUrl: template.documentUrl ?? null,
          documentFileName: template.documentFileName ?? null,
          quickReplyPayloads: template.quickReplyPayloads,
          urlButtonParameters: template.urlButtonParameters,
          contextToken: thread.contextToken,
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
      notification.attemptCount = Number(notification.attemptCount ?? 0) + 1;
      notification.nextAttemptAt = null;
      notification.lastError = null;
      attempt.status = result.status;
      attempt.responsePayload = JSON.stringify(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown dispatch error';
      this.scheduleRetry(notification, message, error);
      attempt.status = 'FAILED';
      attempt.responsePayload = JSON.stringify({ error: message });
      this.logger.error(`Batch intake template dispatch failed for orders ${serviceOrders.map((order) => order.id).join(', ')}: ${message}`);
    }

    await this.notificationRepository.save(notification);
    await this.attemptRepository.save(attempt);
  }

  async dispatchDiagnosisQuoteTemplate(input: DispatchDiagnosisQuoteInput): Promise<string> {
    const thread = await this.inboxService.getThreadForServiceOrder(input.serviceOrder.id, {
      role: 'SUPERVISOR', userId: null, displayName: 'Sistema',
    });
    const recipient = thread.clientPhone ?? input.serviceOrder.clientSnapshotPhone ?? null;
    if (!recipient) return 'SKIPPED_NO_RECIPIENT';
    const notificationKind = input.isRediagnosis ? 'rediagnosis-quote' : 'diagnosis-quote';
    const idempotencyKey = `commercial_version:${input.commercialVersionId}:${notificationKind}-template`;
    let notification = await this.notificationRepository.findOne({ where: { idempotencyKey } });
    if (notification && ['SENT', 'DELIVERED', 'READ'].includes(notification.status)) {
      return notification.status;
    }
    const templateBuilder = input.isRediagnosis
      ? this.whatsappTemplateService.buildRediagnosisAgreementTemplate.bind(this.whatsappTemplateService)
      : this.whatsappTemplateService.buildDiagnosisAgreementAvailableTemplate.bind(this.whatsappTemplateService);
    const template = templateBuilder({
      clientName: input.serviceOrder.clientSnapshotName?.trim() || 'cliente',
      equipmentLabel: input.equipmentLabel,
      orderCode: input.serviceOrder.code,
      totalAmount: Number(input.totalAmount).toFixed(2),
      documentUrl: input.documentUrl,
      documentFileName: input.documentFileName,
      quickReplyPayloads: [`ACEPTAR_COTIZACION:${input.commercialVersionId}`, 'CONSULTA'],
    });
    if (!notification) {
      notification = await this.notificationRepository.save(this.notificationRepository.create({
        serviceOrderId: input.serviceOrder.id,
        channel: 'WHATSAPP_TEMPLATE',
        messageType: input.isRediagnosis
          ? 'rediagnosis.quote.issued'
          : 'diagnosis.quote.issued',
        recipient,
        body: null,
        idempotencyKey,
        status: 'QUEUED',
        scope: 'ORDER_ITEM',
        metadataJson: JSON.stringify({
          commercialVersionId: input.commercialVersionId,
          tempDocumentToken: input.tempDocumentToken,
          templateName: template.templateName,
          languageCode: template.languageCode,
          bodyParameters: template.bodyParameters,
          documentUrl: template.documentUrl ?? null,
          documentFileName: template.documentFileName ?? null,
          quickReplyPayloads: template.quickReplyPayloads,
          urlButtonParameters: template.urlButtonParameters,
          contextToken: thread.contextToken,
        }),
      }));
    }
    const attempt = await this.attemptRepository.save(this.attemptRepository.create({
      notificationMessageId: notification.id, status: 'QUEUED', responsePayload: null,
    }));
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
      notification.attemptCount = Number(notification.attemptCount ?? 0) + 1;
      notification.nextAttemptAt = null;
      notification.lastError = null;
      attempt.status = result.status;
      attempt.responsePayload = JSON.stringify(result);
    } catch (error) {
      this.scheduleRetry(notification, error instanceof Error ? error.message : 'Unknown dispatch error', error);
      attempt.status = 'FAILED';
      attempt.responsePayload = JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown dispatch error' });
    }
    await this.notificationRepository.save(notification);
    await this.attemptRepository.save(attempt);
    return notification.status;
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

  async notifySurveyRequest(serviceOrder: ServiceOrder): Promise<void> {
    if (!this.whatsappTemplateService.hasSurveyRequestTemplate?.()) {
      this.logger.warn(
        `Automatic survey notification skipped for order ${serviceOrder.id}: WHATSAPP_TEMPLATE_SURVEY_NAME is not configured`,
      );
      return;
    }
    if (!this.surveyService) {
      this.logger.error(`Automatic survey notification skipped for order ${serviceOrder.id}: survey service unavailable`);
      return;
    }
    const survey = await this.surveyService.issueForOrder(serviceOrder.id);
    const template = this.whatsappTemplateService.buildSurveyRequestTemplate({
      clientName: serviceOrder.clientSnapshotName?.trim() || 'cliente',
      orderCode: serviceOrder.code,
      equipmentLabel: this.buildSurveyEquipmentSummary(serviceOrder),
      surveyToken: survey.token,
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

  async dispatchCancellationSummaryTemplate(input: DispatchCancellationSummaryInput): Promise<void> {
    const requestIds = [...new Set(input.cancellationRequestIds.map(Number))].sort((a, b) => a - b);
    const template = this.whatsappTemplateService.buildCancellationSummaryTemplate({
      clientName: input.serviceOrder.clientSnapshotName?.trim() || 'cliente',
      itemCount: String(input.itemCount),
      orderCode: input.serviceOrder.code,
      documentUrl: input.documentUrl,
      documentFileName: input.documentFileName,
      quickReplyPayloads: ['CONSULTA'],
    });
    await this.dispatchTemplateNotification(
      input.serviceOrder,
      `service_order:${input.serviceOrder.id}:cancellation:${requestIds.join('-')}`,
      'cancellation.summary',
      template,
      { cancellationRequestIds: requestIds, tempDocumentToken: input.tempDocumentToken },
    );
  }

  async dispatchFinalServiceReportTemplate(input: DispatchFinalServiceReportInput): Promise<void> {
    const template = this.whatsappTemplateService.buildFinalServiceTemplate({
      clientName: input.serviceOrder.clientSnapshotName?.trim() || 'cliente',
      equipmentLabel: input.equipmentLabel,
      itemCode: input.itemCode,
      documentUrl: input.documentUrl,
      documentFileName: input.documentFileName,
      quickReplyPayloads: [`CONSULTA_ESTADO_FINAL:${input.serviceOrderItemId}`],
    });
    await this.dispatchTemplateNotification(
      input.serviceOrder,
      `service_order_item:${input.serviceOrderItemId}:final-service-report`,
      'service.final.report',
      template,
      {
        serviceOrderItemId: input.serviceOrderItemId,
        tempDocumentToken: input.tempDocumentToken,
      },
      'ORDER_ITEM',
    );
  }

  async dispatchQuoteReminderTemplate(input: DispatchDiagnosisQuoteInput): Promise<void> {
    const template = this.whatsappTemplateService.buildQuoteReminderTemplate({
      clientName: input.serviceOrder.clientSnapshotName?.trim() || 'cliente',
      equipmentLabel: input.equipmentLabel,
      orderCode: input.serviceOrder.code,
      totalAmount: Number(input.totalAmount).toFixed(2),
      documentUrl: input.documentUrl,
      documentFileName: input.documentFileName,
      quickReplyPayloads: [`ACEPTAR_COTIZACION:${input.commercialVersionId}`, 'CONSULTA'],
    });
    await this.dispatchTemplateNotification(
      input.serviceOrder,
      `commercial_version:${input.commercialVersionId}:quote-reminder`,
      'quote.reminder',
      template,
      { commercialVersionId: input.commercialVersionId, tempDocumentToken: input.tempDocumentToken },
      'ORDER_ITEM',
    );
  }

  async dispatchPaymentReceiptTemplate(input: {
    serviceOrder: ServiceOrder;
    electronicDocumentId: number;
    documentNumber: string;
    totalAmount: number;
    documentUrl: string;
    documentFileName: string;
    tempDocumentToken: string;
  }): Promise<void> {
    await this.dispatchTemplateNotification(
      input.serviceOrder,
      `electronic_document:${input.electronicDocumentId}:payment-receipt`,
      'payment.receipt',
      this.whatsappTemplateService.buildPaymentReceiptTemplate({
        clientName: input.serviceOrder.clientSnapshotName?.trim() || 'cliente',
        orderCode: input.serviceOrder.code,
        documentNumber: input.documentNumber,
        totalAmount: `S/ ${Number(input.totalAmount).toFixed(2)}`,
        documentUrl: input.documentUrl,
        documentFileName: input.documentFileName,
        quickReplyPayloads: ['CONSULTA'],
      }),
      { electronicDocumentId: input.electronicDocumentId, tempDocumentToken: input.tempDocumentToken },
    );
  }

  async dispatchPickupReminderTemplate(input: {
    serviceOrder: ServiceOrder;
    itemIds: number[];
    equipmentSummary: string;
    documentUrl: string;
    documentFileName: string;
    tempDocumentToken: string;
    automatic: boolean;
  }): Promise<void> {
    const itemIds = [...new Set(input.itemIds.map(Number))].sort((a, b) => a - b);
    const suffix = input.automatic ? 'automatic' : `manual:${itemIds.join('-')}`;
    await this.dispatchTemplateNotification(
      input.serviceOrder,
      `service_order:${input.serviceOrder.id}:pickup-reminder:${suffix}`,
      'pickup.reminder',
      this.whatsappTemplateService.buildPickupReminderTemplate({
        clientName: input.serviceOrder.clientSnapshotName?.trim() || 'cliente',
        orderCode: input.serviceOrder.code,
        equipmentSummary: input.equipmentSummary,
        documentUrl: input.documentUrl,
        documentFileName: input.documentFileName,
        quickReplyPayloads: ['CONSULTA'],
      }),
      { itemIds, automatic: input.automatic, tempDocumentToken: input.tempDocumentToken },
    );
  }

  async listFinalFailures(): Promise<NotificationMessage[]> {
    return this.notificationRepository.find({
      where: { status: 'FAILED_FINAL' },
      order: { updatedAt: 'DESC' },
      take: 100,
    });
  }

  async hasNotification(idempotencyKey: string): Promise<boolean> {
    return Boolean(await this.notificationRepository.findOne({ where: { idempotencyKey } }));
  }

  async retryFinalFailure(id: number): Promise<NotificationMessage> {
    const notification = await this.notificationRepository.findOne({ where: { id } });
    if (!notification || notification.status !== 'FAILED_FINAL') {
      throw new NotFoundException('Notificación final fallida no encontrada');
    }
    notification.status = 'RETRY_SCHEDULED';
    notification.nextAttemptAt = new Date();
    notification.lastError = null;
    await this.notificationRepository.save(notification);
    await this.retryNotification(notification);
    return this.notificationRepository.findOneOrFail({ where: { id } });
  }

  @Cron(process.env.SERVICE_ORDER_NOTIFICATION_SCHEDULER_CRON || '0 */15 * * * *')
  async retryScheduledNotifications(): Promise<void> {
    if (this.configService?.get<string>('WHATSAPP_NOTIFICATION_RETRY_ENABLED') === 'false') return;
    const pending = await this.notificationRepository.find({
      where: { status: 'RETRY_SCHEDULED', nextAttemptAt: LessThanOrEqual(new Date()) },
      order: { nextAttemptAt: 'ASC' },
      take: 50,
    });
    for (const notification of pending) await this.retryNotification(notification);
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
    extraMetadata: Record<string, unknown> = {},
    scope = 'ORDER',
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
        scope,
        metadataJson: JSON.stringify({
          templateName: template.templateName,
          languageCode: template.languageCode,
          bodyParameters: template.bodyParameters,
          documentUrl: template.documentUrl ?? null,
          documentFileName: template.documentFileName ?? null,
          quickReplyPayloads: template.quickReplyPayloads,
          urlButtonParameters: template.urlButtonParameters,
          contextToken: thread.contextToken,
          ...extraMetadata,
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
        urlButtonParameters: template.urlButtonParameters,
        contextToken: thread.contextToken,
      });
      notification.status = result.status;
      notification.attemptCount = Number(notification.attemptCount ?? 0) + 1;
      notification.nextAttemptAt = null;
      notification.lastError = null;
      attempt.status = result.status;
      attempt.responsePayload = JSON.stringify(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown dispatch error';
      this.scheduleRetry(notification, message, error);
      attempt.status = 'FAILED';
      attempt.responsePayload = JSON.stringify({ error: message });
      this.logger.error(`Template dispatch failed for order ${serviceOrder.id}: ${message}`);
    }

    await this.notificationRepository.save(notification);
    await this.attemptRepository.save(attempt);
  }

  private async retryNotification(notification: NotificationMessage): Promise<void> {
    const metadata = this.parseMetadata(notification.metadataJson);
    const attempt = await this.attemptRepository.save(this.attemptRepository.create({
      notificationMessageId: notification.id,
      status: 'QUEUED',
      responsePayload: null,
    }));
    try {
      const result = await this.inboxChannelService.dispatchTemplateMessage({
        clientPhone: String(notification.recipient ?? ''),
        templateName: String(metadata.templateName ?? ''),
        languageCode: String(metadata.languageCode ?? 'es_PE'),
        documentUrl: this.optionalString(metadata.documentUrl),
        documentFileName: this.optionalString(metadata.documentFileName),
        bodyParameters: this.stringArray(metadata.bodyParameters),
        quickReplyPayloads: this.stringArray(metadata.quickReplyPayloads),
        urlButtonParameters: this.stringArray(metadata.urlButtonParameters),
        contextToken: String(metadata.contextToken ?? ''),
      });
      notification.status = result.status;
      notification.attemptCount = Number(notification.attemptCount ?? 0) + 1;
      notification.nextAttemptAt = null;
      notification.lastError = null;
      attempt.status = result.status;
      attempt.responsePayload = JSON.stringify(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown dispatch error';
      this.scheduleRetry(notification, message, error);
      attempt.status = 'FAILED';
      attempt.responsePayload = JSON.stringify({ error: message });
    }
    await this.notificationRepository.save(notification);
    await this.attemptRepository.save(attempt);
  }

  private scheduleRetry(notification: NotificationMessage, message: string, error?: unknown): void {
    const attemptCount = Number(notification.attemptCount ?? 0) + 1;
    const delays = this.retryDelays();
    notification.attemptCount = attemptCount;
    notification.lastError = message;
    if (
      attemptCount > delays.length ||
      this.configService?.get<string>('WHATSAPP_NOTIFICATION_RETRY_ENABLED') === 'false' ||
      this.isPermanentError(error)
    ) {
      notification.status = 'FAILED_FINAL';
      notification.nextAttemptAt = null;
      return;
    }
    notification.status = 'RETRY_SCHEDULED';
    notification.nextAttemptAt = new Date(Date.now() + delays[attemptCount - 1] * 60_000);
  }

  private isPermanentError(error: unknown): boolean {
    const status = Number(
      (error as { status?: number; statusCode?: number; response?: { status?: number } } | null)?.status ??
      (error as { statusCode?: number } | null)?.statusCode ??
      (error as { response?: { status?: number } } | null)?.response?.status,
    );
    return Number.isFinite(status) && status >= 400 && status < 500 && status !== 429;
  }

  private retryDelays(): number[] {
    const configured = String(this.configService?.get<string>('WHATSAPP_NOTIFICATION_RETRY_DELAYS_MINUTES') ?? '1,5,30')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
    return configured.length ? configured : [1, 5, 30];
  }

  private parseMetadata(value: string | null): Record<string, unknown> {
    try { return value ? JSON.parse(value) as Record<string, unknown> : {}; } catch { return {}; }
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
  }

  private optionalString(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized || null;
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

  private buildSurveyEquipmentSummary(serviceOrder: ServiceOrder): string {
    const items = serviceOrder.items ?? [];
    if (items.length > 1) return `${items.length} equipos`;
    if (items.length === 1) {
      const item = items[0];
      const labels: Record<string, string> = {
        LAPTOP: 'Laptop',
        DESKTOP_PC: 'PC de escritorio',
        ALL_IN_ONE: 'All in One',
        PRINTER: 'Impresora',
        SCANNER: 'Escáner',
        PROJECTOR: 'Proyector',
        MONITOR: 'Monitor',
        SERVER: 'Servidor',
        NETWORK_DEVICE: 'Equipo de red',
        OTHER: item.equipmentTypeOther || 'Equipo',
      };
      return [labels[item.equipmentType] || 'Equipo', item.brand, item.model]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(' ');
    }
    return this.buildEquipmentLabel(serviceOrder);
  }

  private normalizeComparableText(value: string | null | undefined): string {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

}
