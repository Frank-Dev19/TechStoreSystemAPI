import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';

import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditLog } from './entities/audit-log.entity';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { GenericSubscriber } from './subscribers/generic.subscriber';
import { AuditRolesGuard } from './guards/audit-roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [
    AuditService,
    GenericSubscriber,
    AuditRolesGuard,
    // Interceptor GLOBAL para HTTP (excluye /audit por código)
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
  controllers: [AuditController],
})
export class AuditModule { }
