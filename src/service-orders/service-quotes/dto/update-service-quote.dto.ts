import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceOrderQuoteDto } from './create-service-quote.dto';

export class UpdateServiceOrderQuoteDto extends PartialType(CreateServiceOrderQuoteDto) {}
