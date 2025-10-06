import { IsBoolean, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, MinLength } from "class-validator";

export class CreateBusinessPartnerDto {
    @IsNumber()
    @IsOptional()
    companyId?: number;

    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    name: string;

    @IsString()
    @IsOptional()
    tradeName?: string;

    @IsNumber()
    @IsNotEmpty()
    documentTypeId: number;

    @IsString()
    @IsNotEmpty()
    documentNumber: string;

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @IsOptional()
    phone?: string;

    @IsString()
    @IsOptional()
    address?: string;

    @IsString()
    @IsOptional()
    city?: string;

    @IsString()
    @IsOptional()
    country?: string;

    @IsBoolean()
    @IsOptional()
    isClient?: boolean;

    @IsBoolean()
    @IsOptional()
    isSupplier?: boolean;
}
