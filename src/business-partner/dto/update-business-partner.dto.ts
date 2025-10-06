import { PartialType } from '@nestjs/mapped-types';
import { CreateBusinessPartnerDto } from './create-business-partner.dto';

export class UpdateBusinessPartnerDto extends PartialType(CreateBusinessPartnerDto) {}
