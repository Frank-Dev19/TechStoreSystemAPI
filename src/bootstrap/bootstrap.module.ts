import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/roles/entities/permission.entity';
import { BootstrapService } from './bootstrap.service';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';
import { PermissionModule as PermModule } from 'src/roles/entities/permission-module.entity';
import { ServiceCategory } from 'src/service-catalog/entities/service-category.entity';
import { Service } from 'src/service-catalog/entities/service.entity';



@Module({
    imports: [TypeOrmModule.forFeature([User, Role, Permission, PermModule, DocumentType, ServiceCategory, Service])],
    providers: [BootstrapService],
})
export class BootstrapModule { }
