import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceOrderQuotesService } from './service-quotes.service';
import { ServiceOrderQuotesController } from './service-quotes.controller';
import { ServiceOrderQuote } from './entities/service-quote.entity';
import { ServiceOrderQuoteProduct } from './entities/service-quote-product.entity';
import { ServiceOrderQuoteServiceItem } from './entities/service-quote-service-item.entity';
import { ServiceOrderItem } from '../entities/service-order-item.entity';
import { ServiceOrderDiagnosis } from '../diagnoses/entities/service-order-diagnosis.entity';
import { ServiceOrdersModule } from '../service-orders.module';
import { User } from '../../users/entities/user.entity';
import { Service } from '../../service-catalog/entities/service.entity';
import { Product } from '../../inventory/entities/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceOrderQuote,
      ServiceOrderQuoteProduct,
      ServiceOrderQuoteServiceItem,
      ServiceOrderItem,
      ServiceOrderDiagnosis,
      User,
      Service,
      Product,
    ]),
    ServiceOrdersModule,
  ],
  controllers: [ServiceOrderQuotesController],
  providers: [ServiceOrderQuotesService],
  exports: [ServiceOrderQuotesService],
})
export class ServiceOrderQuotesModule {}
