import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMeDto {
    @IsOptional() @IsString() @MinLength(2)
    name?: string;

    @IsOptional() @IsString() @MaxLength(30)
    phone?: string;
}
