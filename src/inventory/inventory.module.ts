import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Category } from './entities/category.entity';
import { Unit } from './entities/unit.entity';
import { Product } from './entities/product.entity';
import { Lot } from './entities/lot.entity';
import { Serial } from './entities/serial.entity';
import { Movement } from './entities/movement.entity';
import { Stock } from './entities/stock.entity';
import { Count } from './entities/count.entity';
import { CountSnapshot } from './entities/count-snapshot.entity';
import { CountEntry } from './entities/count-entry.entity';

import { CatalogsController } from './controllers/catalogs.controller';
import { MovementsController } from './controllers/movements.controller';
import { KardexController } from './controllers/kardex.controller';
import { StockController } from './controllers/stock.controller';
import { LockController } from './controllers/lock.controller';
import { CountsController } from './controllers/counts.controller';

import { CatalogsService } from './services/catalogs.service';
import { MovementsService } from './services/movements.service';
import { KardexService } from './services/kardex.service';
import { StockService } from './services/stock.service';
import { LockService } from './services/lock.service';
import { CountsService } from './services/counts.service';
import { LotsService } from './services/lots.service';
import { LotsController } from './controllers/lots.controller';
import { MovementSerial } from './entities/movement-serial.entity';
import { SerialsService } from './services/serials.service';
import { SerialsController } from './controllers/serials.controller';

@Module({

    imports: [
        TypeOrmModule.forFeature([
            Category, Unit, Product, Lot, Serial, Movement, Stock,
            Count, CountSnapshot, CountEntry, MovementSerial,
        ]),
    ],
    controllers: [
        CatalogsController, MovementsController, KardexController,
        StockController, LockController, CountsController, LotsController, SerialsController,
    ],
    providers: [
        CatalogsService, MovementsService, KardexService,
        StockService, LockService, CountsService, LotsService, SerialsService,
    ],
    exports: [TypeOrmModule]

})
export class InventoryModule { }
