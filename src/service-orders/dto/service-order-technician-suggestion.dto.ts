import { IsEnum } from 'class-validator';
import { ServiceType } from '../enums';

export class ServiceOrderTechnicianSuggestionDto {
  @IsEnum(ServiceType)
  serviceType: ServiceType;
}
