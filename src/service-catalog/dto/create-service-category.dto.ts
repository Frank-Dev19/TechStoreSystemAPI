import { 
    IsBoolean, 
    IsNotEmpty, 
    IsOptional, 
    IsString, 
    Length 
} from "class-validator";
import { Type } from "class-transformer";

export class CreateServiceCategoryDto {
    @IsString()
    @IsNotEmpty()
    @Length(2, 256)
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    @Type(() => Boolean)
    isActive?: boolean;
}
