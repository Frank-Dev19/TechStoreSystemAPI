import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from './entities/service.entity';
import { ServiceCategory } from './entities/service-category.entity';
import { ServiceService } from './services/service.service';
import { ServiceCategoryService } from './services/service-category.service';
import { ServiceController } from './controllers/service.controller';
import { ServiceCategoryController } from './controllers/service-category.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Service, ServiceCategory])],
  controllers: [ServiceController, ServiceCategoryController],
  providers: [ServiceService, ServiceCategoryService],
  exports: [TypeOrmModule, ServiceService, ServiceCategoryService],
})
export class ServiceCatalogModule {}
