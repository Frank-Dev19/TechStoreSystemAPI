import { Body, Controller, Post, Req, Res, UseGuards, Get, Query, ParseIntPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { Request, Response } from 'express';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';

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

    // ===== NUEVOS =====
    @Post('forgot-password')
    forgot(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
        return this.auth.forgotPassword(dto, req);
    }

    @Post('reset-password')
    reset(@Body() dto: ResetPasswordDto) {
        return this.auth.resetPassword(dto);
    }

    // auth.controller.ts
    @Get('password/verify')
    verify(
        @Query('uid', ParseIntPipe) uid: number,
        @Query('token') token: string,
    ): Promise<{ ok: boolean }> {
        return this.auth.verifyReset(uid, token);
    }
}
