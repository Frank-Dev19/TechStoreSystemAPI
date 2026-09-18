import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength, MaxLength, IsInt } from 'class-validator';

export class UpdateUserDto {
    @IsString() @IsOptional()
    name?: string;

    @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
    @IsEmail() @IsOptional()
    email?: string;

    @IsString() @MinLength(6) @IsOptional()
    password?: string;

    @IsString() @IsOptional() @MaxLength(30)
    phone?: string | null;

    // === NUEVO ===
    @IsInt() @IsOptional()
    documentTypeId?: number;

    @IsString() @IsOptional() @MaxLength(50)
    documentNumber?: string;

    @IsArray() @IsOptional()
    roleIds?: number[];

    @IsBoolean() @IsOptional()
    isActive?: boolean;
}
