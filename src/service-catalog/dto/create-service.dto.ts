import { 
    IsBoolean, 
    IsNotEmpty, 
    IsOptional, 
    IsPositive, 
    IsString, 
    Length, 
    IsNumber,
    Min,
    Max,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateServiceDto {
    @IsString()
    @IsNotEmpty()
    @Length(2, 256)
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsNumber()
    @IsPositive()
    @Type(() => Number)
    categoryId: number;

    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    @Type(() => Number)
    price: number;

    @IsNumber()
    @IsPositive()
    @Min(1)
    @Max(9999)
    @IsOptional()
    @Type(() => Number)
    estimatedDurationMinutes?: number;
    
    @IsNumber()
    @Min(0)
    @Max(3650)
    @IsOptional()
    @Type(() => Number)
    warrantyDays?: number;
    
    @IsBoolean()
    @IsOptional()
    @Type(() => Boolean)
    isActive?: boolean;    
}
