import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class AssignPermissionsDto {
    @IsArray() @ArrayNotEmpty()
    @IsString({ each: true })
    permissions: string[]; // códigos, ej: ["user.create","user.read"]
}
