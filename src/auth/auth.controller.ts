import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
    constructor(private auth: AuthService) { }

    @Post('login')
    login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        return this.auth.login(dto, req, res);
    }

    @UseGuards(JwtRefreshGuard)
    @Post('refresh')
    refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        return this.auth.refresh(req, res);
    }

    @Post('logout')
    logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        return this.auth.logout(req, res);
    }
}
