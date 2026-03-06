import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
export class CreateUnitDto {
    @IsString() @IsNotEmpty() @MaxLength(64) name: string;
    @IsString() @IsNotEmpty() @MaxLength(16) abbreviation: string;
}
