import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
//import { UsersModule } from '../users/users.module';
//import { RbacModule } from 'src/rbac/rbac.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission]),
    //UsersModule
    //RbacModule
  ],
  providers: [RolesService, PermissionsService],
  controllers: [RolesController, PermissionsController],
  exports: [RolesService, TypeOrmModule, PermissionsService],
})
export class RolesModule { }
