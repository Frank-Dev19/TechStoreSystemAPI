import { IsOptional, IsString } from 'class-validator';
export class LockDto { @IsString() @IsOptional() reason?: string }
