import {
    Controller,
    Get,
    Param,
    Query,
    Sse,
    MessageEvent,
    UseGuards,
    ParseIntPipe,
} from '@nestjs/common';
import { Observable, interval, map, filter, switchMap, from } from 'rxjs';
import { AuditService } from './audit.service';
import { SearchAuditDto } from './dto/search-audit.dto';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/rbac/guards/roles.guard';

@UseGuards(JwtAccessGuard, RolesGuard)
@RolesDec('admin')
@Controller('audit')
export class AuditController {
    constructor(private readonly audit: AuditService) { }

    @Get('search')
    async search(@Query() dto: SearchAuditDto) {
        // Enviar YYYY-MM-DD para que el servicio construya correctamente el rango
        dto.from = dto.from ?? new Date().toISOString().split('T')[0];
        dto.to = dto.to ?? new Date().toISOString().split('T')[0];
        return this.audit.search(dto);
    }

    @Get(':id')
    async findById(@Param('id', ParseIntPipe) id: number) {
        const item = await this.audit.findById(id);
        return item ?? {};
    }

    // Live tail (SSE) básico
    @Sse('stream')
    stream(@Query() dto: SearchAuditDto): Observable<MessageEvent> {
        // Usar date-only (YYYY-MM-DD)
        const now = new Date();
        const oneMinuteAgo = new Date(Date.now() - 60_000);

        dto.from = dto.from ?? oneMinuteAgo.toISOString().split('T')[0];
        dto.to = dto.to ?? now.toISOString().split('T')[0];
        dto.page = 1;
        dto.pageSize = 20;

        // 👇 ahora number | null
        let lastSeen: number | null = null;

        return interval(2000).pipe(
            switchMap(() => from(this.audit.search(dto))),
            map((res) => {
                const latest = res.items[0];
                if (!latest) return null;
                if (lastSeen === latest.id) return null; // comparar number con number
                lastSeen = latest.id;
                return { data: latest } as MessageEvent;
            }),
            filter((evt): evt is MessageEvent => !!evt),
        );
    }
}
