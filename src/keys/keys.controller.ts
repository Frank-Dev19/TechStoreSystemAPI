import {
    Body,
    Controller,
    Post,
    UseGuards,
    Get,
    Req,
} from '@nestjs/common';
import { KeysService } from './keys.service';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';


@Controller('keys')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class KeysController {
    constructor(private readonly keysService: KeysService) { }

    // Solo admin puede crear/rotar claves
    @Post('create')
    @Permissions('keys.manage')
    async createKey(
        @Body() body: { action: string; code: string },
        @Req() req,
    ) {
        return this.keysService.createOrRotate(
            body.action,
            body.code,
            req.user, // usuario que la crea
        );
    }

    // Validar clave (puede ser usado por otros módulos)
    @Post('validate')
    async validateKey(@Body() body: { action: string; code: string }) {
        return this.keysService.validate(body.action, body.code);
    }

    // Listar (solo admin)
    @Get('active')
    @Permissions('keys.view')
    async list() {
        return this.keysService.listActive();
    }
}