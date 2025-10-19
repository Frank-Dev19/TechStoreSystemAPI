import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateCategoryDto {
    @IsString() @IsNotEmpty() @MaxLength(32) code: string;
    @IsString() @IsNotEmpty() @MaxLength(128) name: string;
    @IsString() @IsOptional() description?: string;
}
