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
//import { AuditRoles } from './decorators/roles.decorator';
import { AuditRolesGuard } from './guards/audit-roles.guard';
import { Roles as RolesDec } from 'src/rbac/decorators/roles.decorator';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';

// @RolesDec('admin')
@Controller('audit')
// @UseGuards(AuditRolesGuard)
export class AuditController {
    constructor(private readonly audit: AuditService) { }

    @Get('search')
    // @Permissions('audit.read')
    async search(@Query() dto: SearchAuditDto) {
        // Enviar YYYY-MM-DD para que el servicio construya correctamente el rango
        dto.from = dto.from ?? new Date().toISOString().split('T')[0];
        dto.to = dto.to ?? new Date().toISOString().split('T')[0];
        return this.audit.search(dto);
    }

    @Get(':id')
    // @Permissions('audit.read')
    async findById(@Param('id', ParseIntPipe) id: number) {
        const item = await this.audit.findById(id);
        return item ?? {};
    }

    // Live tail (SSE) básico
    @Sse('stream')
    // @Permissions('audit.stream')
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
