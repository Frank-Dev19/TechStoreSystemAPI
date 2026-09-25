import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarrantyClaim } from './entities/warranty-claim.entity';
import { WarrantyCoverage } from './entities/warranty-coverage.entity';
import { WarrantyMovement } from './entities/warranty-movement.entity';
import { WarrantiesController } from './warranties.controller';
import { WarrantiesService } from './warranties.service';
import { DispatchRequest } from '../service-orders/materials/dispatch-request.entity';
import { SerialConditionEvent } from '../inventory/entities/serial-condition-event.entity';
import { Serial } from '../inventory/entities/serial.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    WarrantyCoverage,
    WarrantyClaim,
    WarrantyMovement,
    DispatchRequest,
    Serial,
    SerialConditionEvent,
  ])],
  controllers: [WarrantiesController],
  providers: [WarrantiesService],
  exports: [WarrantiesService, TypeOrmModule],
})
export class WarrantiesModule {}
