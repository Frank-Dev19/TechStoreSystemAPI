import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceOrderAgreementsService } from './service-agreements.service';
import { ServiceOrderAgreementsController } from './service-agreements.controller';
import { ServiceOrderAgreement } from './entities/service-agreement.entity';
import { ServiceOrderAgreementProduct } from './entities/service-agreement-product.entity';
import { ServiceOrderAgreementServiceItem } from './entities/service-agreement-service-item.entity';
import { ServiceOrderDiagnosis } from '../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrdersModule } from '../service-orders.module';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../inventory/entities/product.entity';
import { ServiceOrder } from '../entities/service-order.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderItemCommercialVersion } from '../entities/service-order-item-commercial-version.entity';
import { ServiceOrderItemCommercialLine } from '../entities/service-order-item-commercial-line.entity';
import { ServiceOrderAgreementItem } from './entities/service-agreement-item.entity';
import { ServiceOrderCommercialRevisionService } from './service-order-commercial-revision.service';
import { ServiceOrderClientDecision } from './entities/service-order-client-decision.entity';
import { ServiceOrderCommercialDecisionService } from './service-order-commercial-decision.service';
import { ServiceOrderLineDiscount } from './entities/service-order-line-discount.entity';
import { PricingModule } from '../../pricing/pricing.module';
import { ServiceOrderCommercialIssuanceService } from './service-order-commercial-issuance.service';
import { ServiceOrderQuoteReminderService } from './service-order-quote-reminder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceOrderAgreement,
      ServiceOrderAgreementProduct,
      ServiceOrderAgreementServiceItem,
      ServiceOrder,
      ServiceOrderDiagnosis,
      ServiceOrderItem,
      ServiceOrderItemCommercialVersion,
      ServiceOrderItemCommercialLine,
      ServiceOrderAgreementItem,
      ServiceOrderClientDecision,
      ServiceOrderLineDiscount,
      User,
      Product,
    ]),
    ServiceOrdersModule,
    PricingModule,
  ],
  controllers: [ServiceOrderAgreementsController],
  providers: [
    ServiceOrderAgreementsService,
    ServiceOrderCommercialRevisionService,
    ServiceOrderCommercialDecisionService,
    ServiceOrderCommercialIssuanceService,
    ServiceOrderQuoteReminderService,
  ],
  exports: [
    ServiceOrderAgreementsService,
    ServiceOrderCommercialRevisionService,
    ServiceOrderCommercialDecisionService,
    ServiceOrderCommercialIssuanceService,
  ],
})
export class ServiceOrderAgreementsModule {}
