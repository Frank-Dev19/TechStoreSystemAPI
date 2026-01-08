// src/pricing/services/combo-validity.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Combo } from '../entities/combo.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ComboValidityService {
    constructor(
        @InjectRepository(Combo)
        private readonly comboRepo: Repository<Combo>,
    ) { }

    /**
     * Ejecuta todos los días a las 00:05 AM
     * Gestiona la validez de combos según sus fechas de inicio y fin
     */
    @Cron(CronExpression.EVERY_30_SECONDS) // Ajusta según tu zona horaria
    async manageComboValidity() {
        console.log(`[${new Date().toISOString()}] Verificando validez de combos...`);
        const today = new Date();
        const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        // 1. Desactivar combos que han expirado
        const expiredCombos = await this.comboRepo
            .createQueryBuilder('c')
            .where('c.isActive = :active', { active: true })
            .andWhere('c.endsAt IS NOT NULL')
            .andWhere('DATE(c.endsAt) < DATE(:today)', { today: todayDateOnly })
            .getMany();

        // 2. Activar combos cuya fecha de inicio ha llegado
        const combosToActivate = await this.comboRepo
            .createQueryBuilder('c')
            .where('c.isActive = :active', { active: false })
            .andWhere('c.startsAt IS NOT NULL')
            .andWhere('DATE(c.startsAt) <= DATE(:today)', { today: todayDateOnly })
            .andWhere('(c.endsAt IS NULL OR DATE(c.endsAt) >= DATE(:today))', { today: todayDateOnly })
            .getMany();

        // 3. Desactivar combos cuya fecha de inicio es futura
        const futureStartCombos = await this.comboRepo
            .createQueryBuilder('c')
            .where('c.isActive = :active', { active: true })
            .andWhere('c.startsAt IS NOT NULL')
            .andWhere('DATE(c.startsAt) > DATE(:today)', { today: todayDateOnly })
            .getMany();

        // Aplicar cambios
        if (expiredCombos.length > 0) {
            for (const combo of expiredCombos) {
                combo.isActive = false;
            }
            await this.comboRepo.save(expiredCombos);
            console.log(`Desactivados ${expiredCombos.length} combos expirados`);
        }

        if (combosToActivate.length > 0) {
            for (const combo of combosToActivate) {
                combo.isActive = true;
            }
            await this.comboRepo.save(combosToActivate);
            console.log(`Activados ${combosToActivate.length} combos que iniciaron`);
        }

        if (futureStartCombos.length > 0) {
            for (const combo of futureStartCombos) {
                combo.isActive = false;
            }
            await this.comboRepo.save(futureStartCombos);
            console.log(`Desactivados ${futureStartCombos.length} combos con inicio futuro`);
        }

        if (expiredCombos.length === 0 && combosToActivate.length === 0 && futureStartCombos.length === 0) {
            console.log('No hay cambios de validez en combos');
        }
    }

    /**
     * Método que puede ser llamado manualmente para validar combos
     */
    async validateCombosManually(): Promise<void> {
        await this.manageComboValidity();
    }
}