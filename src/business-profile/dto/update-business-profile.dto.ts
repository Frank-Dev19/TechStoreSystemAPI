import { IsIn, IsInt, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { BillingEnvironment, BillingPlan } from '../entities/business-profile.entity';

export class UpdateBusinessProfileDto {
  @IsOptional() @IsString() @Length(11, 11) ruc?: string | null;
  @IsOptional() @IsString() @MaxLength(200) razonSocial?: string | null;
  @IsOptional() @IsString() @MaxLength(200) nombreComercial?: string | null;
  @IsOptional() @IsString() @MaxLength(255) direccion?: string | null;
  @IsOptional() @IsString() @Length(6, 6) ubigueo?: string | null;
  @IsOptional() @IsString() @MaxLength(2) codigoPais?: string | null;
  @IsOptional() @IsString() @MaxLength(100) departamento?: string | null;
  @IsOptional() @IsString() @MaxLength(100) provincia?: string | null;
  @IsOptional() @IsString() @MaxLength(100) distrito?: string | null;
  @IsOptional() @IsString() @MaxLength(150) urbanizacion?: string | null;
  @IsOptional() @IsString() @MaxLength(10) codLocal?: string | null;
  @IsOptional() @IsString() @MaxLength(150) email?: string | null;
  @IsOptional() @IsString() @MaxLength(30) telephone?: string | null;

  @IsOptional() @IsIn(['free', 'premium']) plan?: BillingPlan;
  @IsOptional() @IsIn(['beta', 'produccion', 'nubefact_beta', 'nubefact_produccion']) environment?: BillingEnvironment;
  @IsOptional() @IsInt() apisPeruCompanyId?: number | null;

  @IsOptional() @IsString() @MaxLength(100) solUser?: string | null;
  @IsOptional() @IsString() solPass?: string | null;
  @IsOptional() @IsString() clientId?: string | null;
  @IsOptional() @IsString() clientSecret?: string | null;

  @IsOptional() @IsString() certificadoBase64?: string | null;
  @IsOptional() @IsString() @MaxLength(180) certificadoFilename?: string | null;
  @IsOptional() @IsString() logoBase64?: string | null;
  @IsOptional() @IsString() @MaxLength(180) logoFilename?: string | null;
}
