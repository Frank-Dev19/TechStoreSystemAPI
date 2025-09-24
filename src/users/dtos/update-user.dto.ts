import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
    @IsString() @IsOptional()
    name?: string;

    @IsString() @MinLength(6) @IsOptional()
    password?: string;

    @IsArray() @IsOptional()
    roleIds?: number[];

    @IsBoolean() @IsOptional()
    isActive?: boolean;
}
