// src/pricing/controllers/price-lists.controller.ts
import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { PriceListsService } from '../services/price-lists.service';
import { CreatePriceListDto } from '../dto/create-price-list.dto';
import { UpdatePriceListDto } from '../dto/update-price-list.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';

@UseGuards(JwtAccessGuard)
@Controller('pricing/price-lists')
export class PriceListsController {
    constructor(private readonly svc: PriceListsService) { }

    @Get()
    list() {
        return this.svc.list();
    }

    @Get(':id')
    get(@Param('id') id: string) {
        return this.svc.get(+id);
    }

    @Post()
    create(@Body() dto: CreatePriceListDto) {
        return this.svc.create(dto);
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdatePriceListDto,
    ) {
        return this.svc.update(+id, dto);
    }

    @Delete(':id')
    deactivate(@Param('id') id: string) {
        return this.svc.deactivate(+id);
    }
}
