import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository, } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Serial } from '../entities/serial.entity';
import { MovementSerial } from '../entities/movement-serial.entity';

@Injectable()
export class SerialsService {
    constructor(
        @InjectRepository(Serial) private serialRepo: Repository<Serial>,
        @InjectRepository(MovementSerial) private movSerRepo: Repository<MovementSerial>,
    ) { }

    list(params: { product_id: number; lot_id?: number | null; status?: 'IN_STOCK' | 'ISSUED' | 'DAMAGED' | 'LOST' }) {
        const where: any = { productId: params.product_id };
        if (params.lot_id !== undefined) where.lotId = params.lot_id ?? null;
        if (params.status) where.status = params.status;
        return this.serialRepo.find({ where, relations: ['supplier'], order: { createdAt: 'DESC' } });
    }

    async byMovement(movement_id: number) {
        const rows = await this.movSerRepo.find({ where: { movementId: movement_id }, order: { linkedAt: 'ASC' } });
        return rows.map(r => ({
            serial_id: r.serialId,
            serial_code: r.serial.serialCode,
            lot_id: r.serial.lotId ?? null,
        }));
    }

    async ensureUniqueCodes(productId: number, codes: string[]) {
        // útil para prevalidar duplicados globales
        const exist = await this.serialRepo
            .createQueryBuilder('s')
            .where('s.serialCode IN (:...codes)', { codes })
            .getMany();
        if (exist.length > 0) {
            const dup = exist.map(s => s.serialCode).join(', ');
            throw new BadRequestException(`Serial(es) ya existentes: ${dup}`);
        }
    }

    // Para resolver los sobrantes que no tienen lote
    async resolveSerials(serial_codes: string[]) {
        if (!serial_codes?.length) return [];

        const serials = await this.serialRepo.find({
            where: { serialCode: In(serial_codes) },
            relations: ['lot', 'product'],
        });

        const map = new Map(serials.map(s => [s.serialCode, s]));

        return serial_codes.map(code => {
            const found = map.get(code);
            return found
                ? {
                    serial_code: code,
                    product_id: found.productId,
                    lot_id: found.lotId,
                    lot_code: found.lot?.lotCode ?? null,  // 👈 corregido
                    exists: true,
                }
                : {
                    serial_code: code,
                    product_id: null,
                    lot_id: null,
                    lot_code: null,
                    exists: false,
                };
        });
    }


}
