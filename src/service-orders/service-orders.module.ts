import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientContact } from '../clients/entities/client-contact.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { ServiceOrderController } from './controllers/service-order.controller';
import { ServiceOrderDiagnosisController } from './diagnoses/service-order-diagnosis.controller';
import { ServiceOrderDiagnosis } from './diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderIntakePdfService } from './documents/service-order-intake-pdf.service';
import { ServiceOrderTempDocumentsController } from './documents/service-order-temp-documents.controller';
import { ServiceOrderTempDocument } from './documents/service-order-temp-document.entity';
import { ServiceOrderTempDocumentsService } from './documents/service-order-temp-documents.service';
import { NotificationDeliveryAttempt } from './entities/notification-delivery-attempt.entity';
import { NotificationMessage } from './entities/notification-message.entity';
import { ServiceOrderEvent } from './entities/service-order-event.entity';
import { ServiceOrder } from './entities/service-order.entity';
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
import { ServiceOrderAgreement } from './service-agreements/entities/service-agreement.entity';
import { TechnicianAssignmentBalance } from './entities/technician-assignment-balance.entity';
import { Sale } from '../sales/entities/sale.entity';
import { ServiceOrderDiagnosisService } from './diagnoses/service-order-diagnosis.service';
import { ServiceOrderMessageMatrixService } from './services/service-order-message-matrix.service';
import { ServiceOrderMetricsFactory } from './services/service-order-metrics.factory';
import { ServiceOrderNotificationService } from './services/service-order-notification.service';
import { ServiceOrderSaleLinkService } from './services/service-order-sale-link.service';
import { ServiceOrderService } from './services/service-order.service';
import { ServiceOrderSlaStageResolverService } from './services/service-order-sla-stage.resolver';
import { ServiceOrderStageSlaPolicyService } from './services/service-order-stage-sla-policy.service';
import { ServiceOrderWhatsAppTemplateService } from './services/service-order-whatsapp-template.service';
import { ServiceOrderWorkflowService } from './services/service-order-workflow.service';
import { ServiceOrderTransitionPolicy } from './state-machines/service-order-transition-policy';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceOrder,
      ServiceOrderSaleLink,
      ServiceOrderAgreement,
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
    ]),
  ],
  controllers: [
    ServiceOrderController,
    ServiceOrderDiagnosisController,
    ServiceOrderInboxController,
    ServiceOrderTempDocumentsController,
  ],
  providers: [
    ServiceOrderService,
    ServiceOrderWorkflowService,
    ServiceOrderSlaStageResolverService,
    ServiceOrderStageSlaPolicyService,
    ServiceOrderMetricsFactory,
    ServiceOrderTransitionPolicy,
    ServiceOrderDiagnosisService,
    ServiceOrderSaleLinkService,
    ServiceOrderMessageMatrixService,
    ServiceOrderNotificationService,
    ServiceOrderInboxService,
    ServiceOrderInboxBackfillService,
    ServiceOrderInboxChannelService,
    ServiceOrderWhatsAppTemplateService,
    ServiceOrderTempDocumentsService,
    ServiceOrderIntakePdfService,
  ],
  exports: [
    ServiceOrderService,
    ServiceOrderWorkflowService,
    ServiceOrderDiagnosisService,
    ServiceOrderSaleLinkService,
    ServiceOrderMessageMatrixService,
    ServiceOrderNotificationService,
    ServiceOrderInboxService,
    ServiceOrderWhatsAppTemplateService,
    ServiceOrderTempDocumentsService,
    ServiceOrderIntakePdfService,
  ],
})
export class ServiceOrdersModule {}

