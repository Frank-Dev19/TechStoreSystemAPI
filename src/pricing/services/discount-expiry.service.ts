// src/pricing/services/discount-expiry.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscountRule } from '../entities/discount-rule.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class DiscountExpiryService {
    constructor(
        @InjectRepository(DiscountRule)
        private readonly drRepo: Repository<DiscountRule>,
    ) { }

    /**
     * Ejecuta todos los días a las 00:05 AM
     * Desactiva descuentos cuya fecha de fin haya pasado
     * Activa descuentos cuya fecha de inicio haya llegado
     */
    @Cron(CronExpression.EVERY_30_SECONDS) // Ajusta la hora según tu zona
    async manageDiscountValidity() {
        console.log(`[${new Date().toISOString()}] Verificando validez de descuentos...`);
        const today = new Date();
        const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        // 1. Desactivar descuentos que han expirado
        const expiredDiscounts = await this.drRepo
            .createQueryBuilder('d')
            .where('d.isActive = :active', { active: true })
            .andWhere('d.endsAt IS NOT NULL')
            .andWhere('DATE(d.endsAt) < DATE(:today)', { today: todayDateOnly })
            .getMany();

        // 2. Activar descuentos cuya fecha de inicio ha llegado
        const discountsToActivate = await this.drRepo
            .createQueryBuilder('d')
            .where('d.isActive = :active', { active: false })
            .andWhere('d.startsAt IS NOT NULL')
            .andWhere('DATE(d.startsAt) <= DATE(:today)', { today: todayDateOnly })
            .andWhere('(d.endsAt IS NULL OR DATE(d.endsAt) >= DATE(:today))', { today: todayDateOnly })
            .getMany();

        // 3. Desactivar descuentos cuya fecha de inicio es futura (por si acaso)
        const futureStartDiscounts = await this.drRepo
            .createQueryBuilder('d')
            .where('d.isActive = :active', { active: true })
            .andWhere('d.startsAt IS NOT NULL')
            .andWhere('DATE(d.startsAt) > DATE(:today)', { today: todayDateOnly })
            .getMany();

        // Aplicar cambios
        if (expiredDiscounts.length > 0) {
            for (const discount of expiredDiscounts) {
                discount.isActive = false;
            }
            await this.drRepo.save(expiredDiscounts);
            console.log(`Desactivados ${expiredDiscounts.length} descuentos expirados`);
        }

        if (discountsToActivate.length > 0) {
            for (const discount of discountsToActivate) {
                discount.isActive = true;
            }
            await this.drRepo.save(discountsToActivate);
            console.log(`Activados ${discountsToActivate.length} descuentos que iniciaron`);
        }

        if (futureStartDiscounts.length > 0) {
            for (const discount of futureStartDiscounts) {
                discount.isActive = false;
            }
            await this.drRepo.save(futureStartDiscounts);
            console.log(`Desactivados ${futureStartDiscounts.length} descuentos con inicio futuro`);
        }

        if (expiredDiscounts.length === 0 && discountsToActivate.length === 0 && futureStartDiscounts.length === 0) {
            console.log('No hay cambios de validez en descuentos');
        }
    }
}