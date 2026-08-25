import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessProfileModule } from '../business-profile/business-profile.module';
import { MailerModule } from '../mailer/mailer.module';
import { Sale } from '../sales/entities/sale.entity';
import { ElectronicBillingController } from './electronic-billing.controller';
import { ElectronicBillingService } from './electronic-billing.service';
import { ElectronicDocument } from './entities/electronic-document.entity';
import { ApisPeruBillingClient } from './services/apisperu-billing.client';
import { ServiceOrdersModule } from '../service-orders/service-orders.module';
import { ServiceOrderSaleLink } from '../service-orders/entities/service-order-sale-link.entity';
import { ServiceOrder } from '../service-orders/entities/service-order.entity';

@Module({
  imports: [
    ConfigModule,
    BusinessProfileModule,
    MailerModule,
    ServiceOrdersModule,
    TypeOrmModule.forFeature([Sale, ElectronicDocument, ServiceOrderSaleLink, ServiceOrder]),
  ],
  controllers: [ElectronicBillingController],
  providers: [ElectronicBillingService, ApisPeruBillingClient],
  exports: [ElectronicBillingService],
})
export class ElectronicBillingModule {}
