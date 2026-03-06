import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceOrderDiagnosisDto } from './create-service-order-diagnosis.dto';

export class UpdateServiceOrderDiagnosisDto extends PartialType(CreateServiceOrderDiagnosisDto) {}
