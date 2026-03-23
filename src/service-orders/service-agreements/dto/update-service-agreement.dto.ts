import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceOrderAgreementDto } from './create-service-agreement.dto';

export class UpdateServiceOrderAgreementDto extends PartialType(CreateServiceOrderAgreementDto) {}

