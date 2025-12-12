// src/pricing/controllers/combos.controller.ts
import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    UseGuards,
    Query,
} from '@nestjs/common';
import { CombosService } from '../services/combos.service';
import { CreateComboDto } from '../dto/create-combo.dto';
import { UpdateComboDto } from '../dto/update-combo.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';

@UseGuards(JwtAccessGuard)
@Controller('pricing/combos')
export class CombosController {
    constructor(private readonly svc: CombosService) { }

    @Get()
    list(@Query('activeOnly') activeOnly: string, @Query('page') page: string, @Query('limit') limit: string) {
        // Convertir el parámetro a booleano o null
        let activeOnlyBool: boolean | null = null;

        if (activeOnly !== undefined && activeOnly !== null && activeOnly !== '') {
            // Si es 'true', '1', 'yes' => filtrar solo activos
            if (activeOnly === 'true' || activeOnly === '1' || activeOnly === 'yes' || activeOnly === 'active') {
                activeOnlyBool = true;
            }
            // Si es 'false', '0', 'no' => filtrar solo inactivos
            else if (activeOnly === 'false' || activeOnly === '0' || activeOnly === 'no') {
                activeOnlyBool = false;
            }
            // Si es cualquier otro valor (incluyendo 'inactive'), no filtrar (mostrar todos)
            // O puedes decidir mostrar inactivos como alternativa
            else if (activeOnly === 'inactive') {
                activeOnlyBool = false; // Para mostrar solo inactivos
            }
        }
        // Si no se envía activeOnly, mostrar todos (null)

        return this.svc.list({
            activeOnly: activeOnlyBool,
            page: parseInt(page, 10) || 1,
            limit: parseInt(limit, 10) || 10
        });
    }




    @Get(':id')
    get(@Param('id') id: string) {
        return this.svc.get(+id);
    }

    @Post()
    create(@Body() dto: CreateComboDto) {
        return this.svc.create(dto);
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateComboDto,
    ) {
        return this.svc.update(+id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.svc.remove(+id);
    }
}
