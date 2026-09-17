import { DeliveryListController } from './delivery-list.controller';
import { DeliveryListService } from './delivery-list.service';
import { Module } from '@nestjs/common';
import { InventoryModule } from '../../inventory/inventory.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { ManualDeliveryService } from './manual-delivery.service';

@Module({
  imports: [InventoryModule],
  controllers: [MaterialsController, DeliveryListController],
  providers: [MaterialsService, DeliveryListService, ManualDeliveryService],
})
export class MaterialsModule {}
