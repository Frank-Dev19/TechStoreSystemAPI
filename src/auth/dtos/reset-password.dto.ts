import { IsNumber, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
    @IsNumber()
    uid: number;

    @IsString()
    token: string; // token plano que llega por URL

    @IsString()
    @MinLength(6)
    newPassword: string;
}
