import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPermission } from './entities/user-permission.entity';
import { UserPermissionsService } from './user-permissions.service';
import { UserPermissionsController } from './user-permissions.controller';
import { UsersModule } from './users.module';
import { RolesModule } from 'src/roles/roles.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([UserPermission]),
        UsersModule,   // para UsersService
        RolesModule,   // para PermissionsService
    ],
    controllers: [UserPermissionsController],
    providers: [UserPermissionsService],
    exports: [UserPermissionsService],
})
export class UserPermissionsModule { }
