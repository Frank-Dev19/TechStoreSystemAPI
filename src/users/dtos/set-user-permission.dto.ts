import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class SetUserPermissionDto {
    @IsString()
    permCode: string;           // p.ej. 'sales.read'

    @IsOptional()
    @IsDateString()
    expiresAt?: string;         // ISO string opcional

    @IsOptional()
    @IsObject()
    scope?: Record<string, any>; // opcional ({ storeId: 1 }, etc.)
}
