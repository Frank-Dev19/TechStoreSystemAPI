import { Module, forwardRef } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { RolesModule } from 'src/roles/roles.module';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([User, DocumentType]),
    forwardRef(() => RolesModule),
    RolesModule
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule { }
