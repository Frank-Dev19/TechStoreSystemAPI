// src/sales/sales.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesService } from './services/sales.service';
import { SalesPricingService } from './services/sales-pricing.service';
import { SalesInventoryService } from './services/sales-inventory.service';
import { CashFlowService } from './services/cash-flow.service';
import { DocumentSeriesService } from './services/document-series.service';
import { SalesController } from './controllers/sales.controller';
import { CashFlowController } from './controllers/cash-flow.controller';
import { DocumentSeriesController } from './controllers/document-series.controller';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SalePayment } from './entities/sale-payment.entity';
import { SaleLineDiscount } from './entities/sale-line-discount.entity';
import { SaleComboItem } from './entities/sale-combo-item.entity';
import { DocumentSeries } from './entities/document-series.entity';
import { CashRegister } from './entities/cash-register.entity';
import { CashFlowTransaction } from './entities/cash-flow-transaction.entity';
import { BusinessPartner } from 'src/business-partner/entities/business-partner.entity';
import { Product } from 'src/inventory/entities/product.entity';
import { Lot } from 'src/inventory/entities/lot.entity';
import { Serial } from 'src/inventory/entities/serial.entity';
import { Movement } from 'src/inventory/entities/movement.entity';
import { MovementSerial } from 'src/inventory/entities/movement-serial.entity';
import { Combo } from 'src/pricing/entities/combo.entity';
import { DiscountRule } from 'src/pricing/entities/discount-rule.entity';
import { PricingModule } from 'src/pricing/pricing.module';
import { InventoryModule } from 'src/inventory/inventory.module';
import { BusinessPartnerModule } from 'src/business-partner/business-partner.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      SalePayment,
      SaleLineDiscount,
      SaleComboItem,
      DocumentSeries,
      CashRegister,
      CashFlowTransaction,
      BusinessPartner,
      Product,
      Lot,
      Serial,
      Movement,
      MovementSerial,
      Combo,
      DiscountRule,
    ]),
    PricingModule,
    InventoryModule,
    BusinessPartnerModule,
  ],
  controllers: [SalesController, CashFlowController, DocumentSeriesController],
  providers: [
    SalesService,
    SalesPricingService,
    SalesInventoryService,
    CashFlowService,
    DocumentSeriesService,
  ],
  exports: [SalesService, CashFlowService, DocumentSeriesService],
})
export class SalesModule { }