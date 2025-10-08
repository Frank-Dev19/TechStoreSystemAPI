import { PartialType } from '@nestjs/mapped-types';
import { CreatePermissionModuleDto } from './create-permission-module.dto';

export class UpdatePermissionModuleDto extends PartialType(CreatePermissionModuleDto) { }
