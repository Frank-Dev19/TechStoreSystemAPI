import { PartialType } from '@nestjs/mapped-types';
import { CreateTicketItemDto } from './create-ticket-item.dto';

export class UpdateTicketItemDto extends PartialType(CreateTicketItemDto) {}
