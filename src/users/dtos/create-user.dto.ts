import { Transform } from 'class-transformer';
import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength, IsInt } from 'class-validator';

export class CreateUserDto {
    @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
    @IsEmail()
    email: string;

    @IsString() @IsNotEmpty()
    name: string;

    @IsString() @IsOptional()
    @MaxLength(30)
    phone?: string;

    // === NUEVO ===
    @IsInt()
    documentTypeId: number;

    @IsString() @IsNotEmpty() @MaxLength(50)
    documentNumber: string;

    @IsString() @MinLength(6)
    password: string;

    @IsArray() @IsOptional()
    roleIds?: number[];
}
