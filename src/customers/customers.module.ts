import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, DocumentType])],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
