import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateDocumentTypeDto {
    @IsString()
    @MaxLength(50)
    name: string;

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}
