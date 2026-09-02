import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientContact } from '../clients/entities/client-contact.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { ServiceOrderController } from './controllers/service-order.controller';
import { ServiceOrderDiagnosisController } from './diagnoses/service-order-diagnosis.controller';
import { ServiceOrderDiagnosis } from './diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderIntakePdfService } from './documents/service-order-intake-pdf.service';
import { ServiceOrderDiagnosisQuotePdfService } from './documents/service-order-diagnosis-quote-pdf.service';
import { ServiceOrderCancellationSummaryPdfService } from './documents/service-order-cancellation-summary-pdf.service';
import { ServiceOrderFinalReportPdfService } from './documents/service-order-final-report-pdf.service';
import { ServiceOrderPickupReminderPdfService } from './documents/service-order-pickup-reminder-pdf.service';
import { ServiceOrderTempDocumentsController } from './documents/service-order-temp-documents.controller';
import { ServiceOrderTempDocument } from './documents/service-order-temp-document.entity';
import { ServiceOrderSurvey } from './surveys/service-order-survey.entity';
import { ServiceOrderSurveyController } from './surveys/service-order-survey.controller';
import { ServiceOrderSurveyService } from './surveys/service-order-survey.service';
import { ServiceOrderTempDocumentsService } from './documents/service-order-temp-documents.service';
import { NotificationDeliveryAttempt } from './entities/notification-delivery-attempt.entity';
import { NotificationMessage } from './entities/notification-message.entity';
import { ServiceOrderEvent } from './entities/service-order-event.entity';
import { ServiceOrder } from './entities/service-order.entity';
import { ServiceOrderDailySequence } from './entities/service-order-daily-sequence.entity';
import { ServiceOrderItem } from './entities/service-order-item.entity';
import { ServiceOrderItemCancellationRequest } from './entities/service-order-item-cancellation-request.entity';
import { ServiceOrderItemCommercialLine } from './entities/service-order-item-commercial-line.entity';
import { ServiceOrderItemCommercialVersion } from './entities/service-order-item-commercial-version.entity';
import { ServiceOrderSaleLink } from './entities/service-order-sale-link.entity';
import { ServiceOrderInboxController } from './inbox/service-order-inbox.controller';
import { ServiceOrderInboxAttachment } from './inbox/entities/service-order-inbox-attachment.entity';
import { ServiceOrderInboxMessageOrderLink } from './inbox/entities/service-order-inbox-message-order-link.entity';
import { ServiceOrderInboxMessage } from './inbox/entities/service-order-inbox-message.entity';
import { ServiceOrderInboxThread } from './inbox/entities/service-order-inbox-thread.entity';
import { ServiceOrderInboxThreadOrderLink } from './inbox/entities/service-order-inbox-thread-order-link.entity';
import { ServiceOrderInboxChannelService } from './inbox/service-order-inbox-channel.service';
import { ServiceOrderInboxBackfillService } from './inbox/service-order-inbox-backfill.service';
import { ServiceOrderInboxService } from './inbox/service-order-inbox.service';
import { ServiceOrderInboxEventsService } from './inbox/service-order-inbox-events.service';
import { PrivateFileStorageService } from './storage/private-file-storage.service';
import { ServiceOrderAgreement } from './service-agreements/entities/service-agreement.entity';
import { ServiceOrderAgreementItem } from './service-agreements/entities/service-agreement-item.entity';
import { TechnicianAssignmentBalance } from './entities/technician-assignment-balance.entity';
import { Sale } from '../sales/entities/sale.entity';
import { ServiceOrderDiagnosisService } from './diagnoses/service-order-diagnosis.service';
import { ServiceOrderMessageMatrixService } from './services/service-order-message-matrix.service';
import { ServiceOrderMetricsFactory } from './services/service-order-metrics.factory';
import { ServiceOrderSaleLinkService } from './services/service-order-sale-link.service';
import { ServiceOrderAggregateService } from './services/service-order-aggregate.service';
import { ServiceOrderAggregateProjectionService } from './services/service-order-aggregate-projection.service';
import { ServiceOrderCodeService } from './services/service-order-code.service';
import { ServiceOrderItemWorkflowService } from './services/service-order-item-workflow.service';
import { ServiceOrderItemCancellationService } from './services/service-order-item-cancellation.service';
import { ServiceOrderItemDeliveryService } from './services/service-order-item-delivery.service';
import { ServiceOrderItemCommercialVersionService } from './services/service-order-item-commercial-version.service';
import { ServiceOrderInitialCommercialService } from './services/service-order-initial-commercial.service';
import { ServiceOrderFinalReportNotificationService } from './services/service-order-final-report-notification.service';
import { ServiceOrderPickupReminderService } from './services/service-order-pickup-reminder.service';
import { PricingModule } from '../pricing/pricing.module';
import { ServiceOrderService } from './services/service-order.service';
import { ServiceOrderSlaStageResolverService } from './services/service-order-sla-stage.resolver';
import { ServiceOrderStageSlaPolicyService } from './services/service-order-stage-sla-policy.service';
import { ServiceOrderWhatsAppTemplateService } from './services/service-order-whatsapp-template.service';
import { ServiceOrderWorkflowService } from './services/service-order-workflow.service';
import { ServiceOrderTransitionPolicy } from './state-machines/service-order-transition-policy';
import { MailerModule } from '../mailer/mailer.module';
import { ServiceOrderSummaryEmailService } from './services/service-order-summary-email.service';
import { ServiceOrderIntakeNotificationService } from './services/service-order-intake-notification.service';
import { WarrantiesModule } from '../warranties/warranties.module';
import { ServiceOrderWarrantyIntakeService } from './services/service-order-warranty-intake.service';

@Module({
  imports: [
    PricingModule,
    MailerModule,
    WarrantiesModule,
    TypeOrmModule.forFeature([
      ServiceOrder,
      ServiceOrderItem,
      ServiceOrderItemCancellationRequest,
      ServiceOrderDailySequence,
      ServiceOrderItemCommercialVersion,
      ServiceOrderItemCommercialLine,
      ServiceOrderSaleLink,
      ServiceOrderAgreement,
      ServiceOrderAgreementItem,
      Sale,
      Client,
      ClientContact,
      User,
      ServiceOrderDiagnosis,
      ServiceOrderEvent,
      TechnicianAssignmentBalance,
      NotificationMessage,
      NotificationDeliveryAttempt,
      ServiceOrderInboxThread,
      ServiceOrderInboxMessage,
      ServiceOrderInboxAttachment,
      ServiceOrderInboxThreadOrderLink,
      ServiceOrderInboxMessageOrderLink,
      ServiceOrderTempDocument,
      ServiceOrderSurvey,
    ]),
  ],
  controllers: [
    ServiceOrderController,
    ServiceOrderDiagnosisController,
    ServiceOrderInboxController,
    ServiceOrderTempDocumentsController,
    ServiceOrderSurveyController,
  ],
  providers: [
    ServiceOrderService,
    ServiceOrderAggregateService,
    ServiceOrderAggregateProjectionService,
    ServiceOrderCodeService,
    ServiceOrderItemWorkflowService,
    ServiceOrderItemCancellationService,
    ServiceOrderItemDeliveryService,
    ServiceOrderItemCommercialVersionService,
    ServiceOrderInitialCommercialService,
    ServiceOrderFinalReportNotificationService,
    ServiceOrderPickupReminderService,
    ServiceOrderSummaryEmailService,
    ServiceOrderIntakeNotificationService,
    ServiceOrderWorkflowService,
    ServiceOrderSlaStageResolverService,
    ServiceOrderStageSlaPolicyService,
    ServiceOrderMetricsFactory,
    ServiceOrderTransitionPolicy,
    ServiceOrderDiagnosisService,
    ServiceOrderSaleLinkService,
    ServiceOrderMessageMatrixService,
    ServiceOrderInboxService,
    ServiceOrderInboxEventsService,
    PrivateFileStorageService,
    ServiceOrderInboxBackfillService,
    ServiceOrderInboxChannelService,
    ServiceOrderWhatsAppTemplateService,
    ServiceOrderTempDocumentsService,
    ServiceOrderSurveyService,
    ServiceOrderIntakePdfService,
    ServiceOrderDiagnosisQuotePdfService,
    ServiceOrderCancellationSummaryPdfService,
    ServiceOrderFinalReportPdfService,
    ServiceOrderPickupReminderPdfService,
    ServiceOrderWarrantyIntakeService,
  ],
  exports: [
    ServiceOrderService,
    ServiceOrderAggregateService,
    ServiceOrderAggregateProjectionService,
    ServiceOrderItemWorkflowService,
    ServiceOrderItemCancellationService,
    ServiceOrderItemDeliveryService,
    ServiceOrderItemCommercialVersionService,
    ServiceOrderWorkflowService,
    ServiceOrderDiagnosisService,
    ServiceOrderSaleLinkService,
    ServiceOrderMessageMatrixService,
    ServiceOrderInboxService,
    ServiceOrderWhatsAppTemplateService,
    ServiceOrderTempDocumentsService,
    ServiceOrderSurveyService,
    ServiceOrderIntakePdfService,
    ServiceOrderDiagnosisQuotePdfService,
    ServiceOrderCancellationSummaryPdfService,
    ServiceOrderFinalReportPdfService,
    ServiceOrderPickupReminderPdfService,
    ServiceOrderPickupReminderService,
    PrivateFileStorageService,
  ],
})
export class ServiceOrdersModule {}

