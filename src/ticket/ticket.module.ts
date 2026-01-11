import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketService } from './services/ticket.service';
import { TicketController } from './controllers/ticket.controller';
import { Ticket } from './entities/ticket.entity';
import { TicketItem } from './entities/ticket-item.entity';
import { TechnicianMetrics } from './entities/technician-metrics.entity';
import { TicketItemCycle } from './entities/ticket-item-cycle.entity';
import { TicketItemEvent } from './entities/ticket-item-event.entity';
import { BusinessPartner } from '../business-partner/entities/business-partner.entity';
import { User } from '../users/entities/user.entity';
import { TicketItemService } from './services/ticket-item.service';
import { TicketItemController } from './controllers/ticket-item.controller';
import { DiagnosticsController } from './diagnostics/diagnostics.controller';
import { DiagnosticsService } from './diagnostics/diagnostics.service';
import { TicketItemDiagnosis } from './diagnostics/entities/ticket-item-diagnosis.entity';
import { TicketItemExpirationService } from './services/ticket-item-expiration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ticket,
      TicketItem,
      BusinessPartner,
      User,
      TicketItemDiagnosis,
      TechnicianMetrics,
      TicketItemCycle,
      TicketItemEvent,
    ]),
  ],
  controllers: [TicketItemController, TicketController, DiagnosticsController],
  providers: [TicketService, TicketItemService, DiagnosticsService, TicketItemExpirationService],
  exports: [TicketService, TicketItemService, DiagnosticsService],
})
export class TicketModule {}
