import { Global, Module, forwardRef } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { UsersModule } from 'src/users/users.module';
//import { RbacService } from './rbac.service';
//import { UsersService } from 'src/users/users.service';
@Global()
@Module({
    imports: [forwardRef(() => UsersModule)],
    providers: [RolesGuard, PermissionsGuard,],
    exports: [RolesGuard, PermissionsGuard,]
})
export class RbacModule { }
