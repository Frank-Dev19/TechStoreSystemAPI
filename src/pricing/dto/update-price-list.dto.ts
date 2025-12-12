// src/pricing/dto/update-price-list.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreatePriceListDto } from './create-price-list.dto';

export class UpdatePriceListDto extends PartialType(CreatePriceListDto) { }
