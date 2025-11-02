import { IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateCountDto {
    @IsString() @MaxLength(64) @IsOptional() code?: string; // aceptamos COUNT-YYYY-### del front
    @IsString() @IsOptional() description?: string;
    // <-- NUEVO
    @IsString() @IsOptional()
    createdBy?: string;

}
