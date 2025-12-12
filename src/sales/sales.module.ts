import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SalePayment } from './entities/sale-payment.entity';
import { BusinessPartner } from 'src/business-partner/entities/business-partner.entity';
import { Product } from 'src/inventory/entities/product.entity';
import { Lot } from 'src/inventory/entities/lot.entity';
import { MovementsService } from 'src/inventory/services/movements.service';
import { Movement } from 'src/inventory/entities/movement.entity';
import { Serial } from 'src/inventory/entities/serial.entity';
import { Stock } from 'src/inventory/entities/stock.entity';
import { MovementSerial } from 'src/inventory/entities/movement-serial.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      SalePayment,

      // Relaciones externas
      BusinessPartner,
      Product,
      Lot,

      // Movimientos de inventario
      Movement,
      Serial,
      Stock,
      MovementSerial,
    ]),
  ],
  controllers: [SalesController],
  providers: [SalesService, MovementsService],
  exports: [SalesService],
})
export class SalesModule { }
