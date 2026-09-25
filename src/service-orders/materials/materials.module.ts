import { DeliveryListController } from './delivery-list.controller';
import { DeliveryListService } from './delivery-list.service';
import { Module } from '@nestjs/common';
import { InventoryModule } from '../../inventory/inventory.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { ManualDeliveryService } from './manual-delivery.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarrantiesModule } from '../../warranties/warranties.module';
import { DispatchRequest } from './dispatch-request.entity';
import { DispatchRequestController } from './dispatch-request.controller';
import { DispatchRequestService } from './dispatch-request.service';

@Module({
  imports: [InventoryModule, WarrantiesModule, TypeOrmModule.forFeature([DispatchRequest])],
  controllers: [MaterialsController, DeliveryListController, DispatchRequestController],
  providers: [MaterialsService, DeliveryListService, ManualDeliveryService, DispatchRequestService],
  exports: [DispatchRequestService],
})
export class MaterialsModule {}
