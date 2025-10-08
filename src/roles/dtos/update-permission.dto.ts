import { PartialType } from '@nestjs/mapped-types';
import { CreatePermissionDto } from './create-permission.dto';
//import { IsString, IsOptional, Length } from 'class-validator';

export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {
    // permitir cambiar sólo el módulo si quieres
    // @IsString()
    // @IsOptional()
    // @Length(2, 100)
    // moduleKey?: string;
}
