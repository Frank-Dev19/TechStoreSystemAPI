import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { Permissions } from '../rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { SignQzPayloadDto } from './dto/sign-qz-payload.dto';
import { QzSigningService } from './qz-signing.service';

@Controller('printing/qz')
export class QzSigningController {
  constructor(private readonly service: QzSigningService) {}

  @Get('certificate')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  certificate(): string {
    return this.service.getCertificate();
  }

  @Post('sign')
  @UseGuards(JwtAccessGuard, PermissionsGuard)
  @Permissions('service-order.read')
  sign(@Body() dto: SignQzPayloadDto): { signature: string } {
    return { signature: this.service.sign(dto.payload) };
  }
}
