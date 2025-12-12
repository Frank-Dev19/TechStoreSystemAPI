// src/pricing/dto/update-discount-rule.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateDiscountRuleDto } from './create-discount-rule.dto';

export class UpdateDiscountRuleDto extends PartialType(CreateDiscountRuleDto) { }
