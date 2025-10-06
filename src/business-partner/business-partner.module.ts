import { Module } from '@nestjs/common';
import { BusinessPartnerService } from './business-partner.service';
import { BusinessPartnerController } from './business-partner.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessPartner } from './entities/business-partner.entity';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessPartner, DocumentType])],
  controllers: [BusinessPartnerController],
  providers: [BusinessPartnerService],
  exports: [BusinessPartnerService]
})
export class BusinessPartnerModule {}
