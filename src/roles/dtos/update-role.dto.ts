import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateRoleDto {
    @IsString() @IsOptional()
    name?: string;

    @IsArray() @IsOptional()
    permissionIds?: number[];
}
