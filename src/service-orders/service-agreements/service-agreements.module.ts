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
import { Service } from '../../service-catalog/entities/service.entity';
import { Product } from '../../inventory/entities/product.entity';
import { ServiceOrder } from '../entities/service-order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceOrderAgreement,
      ServiceOrderAgreementProduct,
      ServiceOrderAgreementServiceItem,
      ServiceOrder,
      ServiceOrderDiagnosis,
      User,
      Service,
      Product,
    ]),
    ServiceOrdersModule,
  ],
  controllers: [ServiceOrderAgreementsController],
  providers: [ServiceOrderAgreementsService],
  exports: [ServiceOrderAgreementsService],
})
export class ServiceOrderAgreementsModule {}

