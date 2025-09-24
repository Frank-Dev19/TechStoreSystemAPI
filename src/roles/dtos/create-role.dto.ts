import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
    @IsString() @IsNotEmpty()
    name: string;

    @IsArray() @IsOptional()
    permissionIds?: number[]; // ids de Permission
}
