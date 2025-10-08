import { IsString, Length, IsOptional, IsInt, Min } from 'class-validator';

export class CreatePermissionDto {
    @IsString() @Length(2, 64)
    moduleKey: string;          // p.ej. 'users', 'role', 'auditoria'

    @IsString() @Length(2, 64)
    actionKey: string;          // p.ej. 'read', 'create', 'delete', 'export'

    @IsString() @Length(3, 255)
    description: string;

    @IsOptional() @IsInt() @Min(0)
    sortOrder?: number;
}
