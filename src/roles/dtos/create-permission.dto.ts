import { IsString, Length } from 'class-validator';

export class CreatePermissionDto {
    @IsString()
    @Length(3, 100)
    code: string;

    @IsString()
    @Length(3, 255)
    description: string;
}
