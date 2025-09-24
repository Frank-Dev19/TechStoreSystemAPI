import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsString() @IsNotEmpty()
    name: string;

    @IsString() @MinLength(6)
    password: string;

    @IsArray() @IsOptional()
    roleIds?: number[];
}
