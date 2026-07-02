import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessProfileModule } from '../business-profile/business-profile.module';
import { Sale } from '../sales/entities/sale.entity';
import { ElectronicBillingController } from './electronic-billing.controller';
import { ElectronicBillingService } from './electronic-billing.service';
import { ElectronicDocument } from './entities/electronic-document.entity';
import { ApisPeruBillingClient } from './services/apisperu-billing.client';

@Module({
  imports: [
    ConfigModule,
    BusinessProfileModule,
    TypeOrmModule.forFeature([Sale, ElectronicDocument]),
  ],
  controllers: [ElectronicBillingController],
  providers: [ElectronicBillingService, ApisPeruBillingClient],
  exports: [ElectronicBillingService],
})
export class ElectronicBillingModule {}
