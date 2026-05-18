import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateDocumentTypeDto {
    @IsString()
    @MaxLength(50)
    name: string;

    @IsNumber()
    @IsOptional()
    digits: number;

    @IsString()
    @MaxLength(4)
    @IsOptional()
    sunatCode?: string;

    @IsIn(['PERSON', 'COMPANY'])
    @IsOptional()
    kind?: 'PERSON' | 'COMPANY';

    @IsString()
    @MaxLength(255)
    description: string;
}
