import { IsInt, IsIn, IsOptional, IsString, IsEnum, IsISO8601, Min, Max, IsNumberString } from 'class-validator';
import { Type } from 'class-transformer';

// Valores en runtime (para @IsIn)
import { AUDIT_ACTIONS, AUDIT_ENTITIES, AUDIT_METHODS } from '../entities/audit-log.entity';
import type { AuditAction, AuditEntity, AuditMethod } from '../entities/audit-log.entity';

export class SearchAuditDto {
  @IsISO8601() from!: string;
  @IsISO8601() to!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsIn(AUDIT_ACTIONS, { message: 'action inválida' })
  action?: AuditAction;

  @IsOptional()
  @IsIn(AUDIT_ENTITIES, { message: 'entity inválida' })
  entity?: AuditEntity;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  @IsOptional()
  @IsIn(AUDIT_METHODS, { message: 'method inválido' })
  method?: AuditMethod;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  sort?: 'ts:desc' | 'ts:asc';
}

export class AuditSearchResponse<T = any> {
  items!: T[];
  total!: number;
  page!: number;
  pageSize!: number;
}
