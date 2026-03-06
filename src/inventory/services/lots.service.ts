import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lot } from '../entities/lot.entity';
import { Product } from '../entities/product.entity';

@Injectable()
export class LotsService {
    constructor(
        @InjectRepository(Lot) private lotRepo: Repository<Lot>,
        @InjectRepository(Product) private prodRepo: Repository<Product>,
    ) { }

    async create(dto: { product_id: number; lot_code: string; expiration_date?: string | null; supplier_id?: number | null }) {
        const product = await this.prodRepo.findOneBy({ id: dto.product_id });
        if (!product) throw new BadRequestException('Producto inválido');

        const lot = this.lotRepo.create({
            productId: product.id,
            lotCode: dto.lot_code,
            expirationDate: dto.expiration_date ?? null,
            supplierId: dto.supplier_id ?? null,
        });
        const saved = await this.lotRepo.save(lot);
        // Responder con nombres “front-friendly”
        return {
            id: saved.id,
            product_id: saved.productId,
            lot_code: saved.lotCode,
            expiration_date: saved.expirationDate,
            supplier_id: saved.supplierId,
        };
    }

    async list(product_id?: number) {
        const where = product_id ? { productId: product_id } : {};
        const rows = await this.lotRepo.find({ where, order: { createdAt: 'DESC' } });
        return rows.map(l => ({
            id: l.id,
            product_id: l.productId,
            lot_code: l.lotCode,
            expiration_date: l.expirationDate,
            supplier_id: l.supplierId,
        }));
    }
}
