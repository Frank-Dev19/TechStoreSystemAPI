import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { ClientContact } from './entities/client-contact.entity';
import { Client } from './entities/client.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Client, ClientContact, DocumentType])],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
