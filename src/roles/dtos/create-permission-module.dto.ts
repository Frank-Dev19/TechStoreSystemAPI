import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreatePermissionModuleDto {
    @IsString()
    @Length(2, 100)
    moduleKey: string;

    @IsString()
    @Length(2, 120)
    label: string;

    @IsString()
    @IsOptional()
    @Length(1, 80)
    icon?: string;

    @IsInt()
    @IsOptional()
    @Min(0)
    sortOrder?: number;
}
