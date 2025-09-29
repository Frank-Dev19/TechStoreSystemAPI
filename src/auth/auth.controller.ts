import { Body, Controller, Post, Req, Res, UseGuards, Get, Query, ParseIntPipe, Patch } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { Request, Response } from 'express';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { UpdateMeDto } from './dtos/update-me.dto';

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

    //Endpoint para cambiar contraseña
    @UseGuards(JwtAccessGuard)
    @Post('change-password')
    changePassword(@Body() dto: ChangePasswordDto, @Req() req: any) {
        // req.user viene del JwtAccessStrategy (payload con { sub, email, roles... })
        const userId = req.user?.sub;
        return this.auth.changePassword(userId, dto);
    }


    @UseGuards(JwtAccessGuard)
    @Get('me')
    me(@Req() req: any) {
        return this.auth.me(req.user.sub);
    }

    @UseGuards(JwtAccessGuard)
    @Patch('me')
    updateMe(@Body() dto: UpdateMeDto, @Req() req: any) {
        return this.auth.updateMe(req.user.sub, dto);
    }
}
