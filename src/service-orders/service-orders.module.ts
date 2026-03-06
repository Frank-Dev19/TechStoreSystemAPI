import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceOrderService } from './services/service-order.service';
import { ServiceOrderController } from './controllers/service-order.controller';
import { ServiceOrder } from './entities/service-order.entity';
import { ServiceOrderItem } from './entities/service-order-item.entity';
import { ServiceOrderItemEvent } from './entities/service-order-item-event.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../users/entities/user.entity';
import { ServiceOrderItemService } from './services/service-order-item.service';
import { ServiceOrderItemController } from './controllers/service-order-item.controller';
import { ServiceOrderDiagnosisController } from './diagnoses/service-order-diagnosis.controller';
import { ServiceOrderDiagnosisService } from './diagnoses/service-order-diagnosis.service';
import { ServiceOrderDiagnosis } from './diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrderItemExpirationService } from './services/service-order-item-expiration.service';
import { TechnicianAssignmentBalance } from './entities/technician-assignment-balance.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceOrder,
      ServiceOrderItem,
      Client,
      User,
      ServiceOrderDiagnosis,
      ServiceOrderItemEvent,
      TechnicianAssignmentBalance,
    ]),
  ],
  controllers: [ServiceOrderItemController, ServiceOrderController, ServiceOrderDiagnosisController],
  providers: [ServiceOrderService, ServiceOrderItemService, ServiceOrderDiagnosisService, ServiceOrderItemExpirationService],
  exports: [ServiceOrderService, ServiceOrderItemService, ServiceOrderDiagnosisService],
})
export class ServiceOrdersModule {}
