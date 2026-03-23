import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { ServiceOrderController } from './controllers/service-order.controller';
import { ServiceOrderPaymentController } from './controllers/service-order-payment.controller';
import { ServiceOrderDiagnosisController } from './diagnoses/service-order-diagnosis.controller';
import { ServiceOrderDiagnosis } from './diagnoses/entities/service-order-diagnosis.entity';
import { NotificationDeliveryAttempt } from './entities/notification-delivery-attempt.entity';
import { NotificationMessage } from './entities/notification-message.entity';
import { ServiceOrderEvent } from './entities/service-order-event.entity';
import { ServiceOrderPayment } from './entities/service-order-payment.entity';
import { ServiceOrder } from './entities/service-order.entity';
import { ServiceOrderAgreement } from './service-agreements/entities/service-agreement.entity';
import { TechnicianAssignmentBalance } from './entities/technician-assignment-balance.entity';
import { Service } from '../service-catalog/entities/service.entity';
import { ServiceOrderDiagnosisService } from './diagnoses/service-order-diagnosis.service';
import { ServiceOrderNotificationService } from './services/service-order-notification.service';
import { ServiceOrderPaymentService } from './services/service-order-payment.service';
import { ServiceOrderService } from './services/service-order.service';
import { ServiceOrderWorkflowService } from './services/service-order-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceOrder,
      ServiceOrderAgreement,
      Service,
      Client,
      User,
      ServiceOrderDiagnosis,
      ServiceOrderEvent,
      ServiceOrderPayment,
      TechnicianAssignmentBalance,
      NotificationMessage,
      NotificationDeliveryAttempt,
    ]),
  ],
  controllers: [ServiceOrderController, ServiceOrderDiagnosisController, ServiceOrderPaymentController],
  providers: [
    ServiceOrderService,
    ServiceOrderWorkflowService,
    ServiceOrderDiagnosisService,
    ServiceOrderPaymentService,
    ServiceOrderNotificationService,
  ],
  exports: [
    ServiceOrderService,
    ServiceOrderWorkflowService,
    ServiceOrderDiagnosisService,
    ServiceOrderPaymentService,
    ServiceOrderNotificationService,
  ],
})
export class ServiceOrdersModule {}

