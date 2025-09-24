import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/roles/entities/role.entity';
import { Permission } from 'src/roles/entities/permission.entity';
import { BootstrapService } from './bootstrap.service';

@Module({
    imports: [TypeOrmModule.forFeature([User, Role, Permission])],
    providers: [BootstrapService],
})
export class BootstrapModule { }
