import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { Quote } from './entities/quote.entity';
import { QuoteProduct } from './entities/quote-product.entity';
import { QuoteServiceItem } from './entities/quote-service-item.entity';
import { TicketItem } from '../entities/ticket-item.entity';
import { TicketItemDiagnosis } from '../diagnostics/entities/ticket-item-diagnosis.entity';
import { TicketModule } from '../ticket.module';
import { User } from '../../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quote, QuoteProduct, QuoteServiceItem, TicketItem, TicketItemDiagnosis, User]),
    TicketModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
