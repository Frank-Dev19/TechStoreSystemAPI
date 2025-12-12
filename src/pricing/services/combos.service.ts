// src/pricing/services/combos.service.ts
import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Combo } from '../entities/combo.entity';
import { ComboItem } from '../entities/combo-item.entity';
import { CreateComboDto, ComboItemInputDto } from '../dto/create-combo.dto';
import { UpdateComboDto } from '../dto/update-combo.dto';
import { Product } from 'src/inventory/entities/product.entity';
import { ComboType } from '../enums/combo-type.enum';

@Injectable()
export class CombosService {
    constructor(
        @InjectRepository(Combo)
        private readonly comboRepo: Repository<Combo>,
        @InjectRepository(ComboItem)
        private readonly comboItemRepo: Repository<ComboItem>,
        @InjectRepository(Product)
        private readonly prodRepo: Repository<Product>,
    ) { }

    private async validateItems(items: ComboItemInputDto[]) {
        if (!items.length) {
            throw new BadRequestException('El combo debe tener al menos un ítem');
        }
        for (const it of items) {
            const prod = await this.prodRepo.findOne({
                where: { id: it.product_id },
            });
            if (!prod) {
                throw new BadRequestException(
                    `Producto inválido en combo (id=${it.product_id})`,
                );
            }
        }
    }

    private mapItems(
        comboId: number,
        items: ComboItemInputDto[],
    ): ComboItem[] {
        return items.map((it) =>
            this.comboItemRepo.create({
                comboId,
                productId: it.product_id,
                qty: it.qty,
            }),
        );
    }

    async create(dto: CreateComboDto) {
        if (dto.combo_type === ComboType.FIXED_PRICE && dto.combo_price == null) {
            throw new BadRequestException(
                'combo_price es obligatorio para combos FIXED_PRICE',
            );
        }
        if (dto.combo_type === ComboType.PERCENT && dto.discount_percent == null) {
            throw new BadRequestException(
                'discount_percent es obligatorio para combos PERCENT',
            );
        }

        await this.validateItems(dto.items);

        const combo = this.comboRepo.create({
            code: dto.code,
            name: dto.name,
            description: dto.description ?? null,
            comboType: dto.combo_type,
            comboPrice:
                dto.combo_type === ComboType.FIXED_PRICE
                    ? dto.combo_price ?? 0
                    : null,
            discountPercent:
                dto.combo_type === ComboType.PERCENT
                    ? dto.discount_percent ?? 0
                    : null,
            autoApply: dto.auto_apply ?? false,
            requiresPermission: dto.requires_permission ?? null,
            startsAt: dto.starts_at ? new Date(dto.starts_at) : null,
            endsAt: dto.ends_at ? new Date(dto.ends_at) : null,
            isActive: dto.is_active ?? true,
        });

        const saved = await this.comboRepo.save(combo);
        const items = this.mapItems(saved.id, dto.items);
        saved.items = await this.comboItemRepo.save(items);
        return saved;
    }

    async update(id: number, dto: UpdateComboDto) {
        const combo = await this.comboRepo.findOne({
            where: { id },
            relations: ['items'],
        });
        if (!combo) {
            throw new NotFoundException('Combo no encontrado');
        }

        if (dto.code !== undefined) combo.code = dto.code;
        if (dto.name !== undefined) combo.name = dto.name;
        if (dto.description !== undefined) combo.description = dto.description;
        if (dto.combo_type !== undefined) combo.comboType = dto.combo_type;

        if (dto.combo_type === ComboType.FIXED_PRICE) {
            if (dto.combo_price == null && combo.comboPrice == null) {
                throw new BadRequestException(
                    'combo_price es obligatorio para combos FIXED_PRICE',
                );
            }
            if (dto.combo_price !== undefined) combo.comboPrice = dto.combo_price;
            combo.discountPercent = null;
        } else if (dto.combo_type === ComboType.PERCENT) {
            if (dto.discount_percent == null && combo.discountPercent == null) {
                throw new BadRequestException(
                    'discount_percent es obligatorio para combos PERCENT',
                );
            }
            if (dto.discount_percent !== undefined) {
                combo.discountPercent = dto.discount_percent;
            }
            combo.comboPrice = null;
        }

        if (dto.auto_apply !== undefined) combo.autoApply = dto.auto_apply;
        if (dto.requires_permission !== undefined)
            combo.requiresPermission = dto.requires_permission ?? null;
        if (dto.starts_at !== undefined)
            combo.startsAt = dto.starts_at ? new Date(dto.starts_at) : null;
        if (dto.ends_at !== undefined)
            combo.endsAt = dto.ends_at ? new Date(dto.ends_at) : null;
        if (dto.is_active !== undefined) combo.isActive = dto.is_active;

        // actualizar items si vienen
        if (dto.items && dto.items.length) {
            await this.validateItems(dto.items);
            await this.comboItemRepo.delete({ comboId: combo.id });
            const items = this.mapItems(combo.id, dto.items);
            combo.items = await this.comboItemRepo.save(items);
        }

        return this.comboRepo.save(combo);
    }

    async list(filters?: { activeOnly?: boolean | null, page?: number, limit?: number }) {
        const where: any = {};

        // Si activeOnly es true: solo activos
        if (filters?.activeOnly === true) {
            where.isActive = true;
        }
        // Si activeOnly es false: solo inactivos
        else if (filters?.activeOnly === false) {
            where.isActive = false;
        }
        // Si activeOnly es null/undefined: mostrar todos

        // Paginación
        const page = filters?.page ?? 1;
        const limit = filters?.limit ?? 10;
        const skip = (page - 1) * limit;

        // Contar total de registros que cumplen con el filtro
        const total = await this.comboRepo.count({ where });

        // Obtener datos con paginación
        const data = await this.comboRepo.find({
            where,
            relations: ['items', 'items.product'],
            order: { code: 'ASC' },
            skip,
            take: limit,
        });

        return {
            data,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1,
            }
        };
    }


    async get(id: number) {
        const combo = await this.comboRepo.findOne({
            where: { id },
            relations: ['items', 'items.product'],
        });
        if (!combo) throw new NotFoundException('Combo no encontrado');
        return combo;
    }

    async remove(id: number) {
        const combo = await this.comboRepo.findOne({ where: { id } });
        if (!combo) {
            throw new NotFoundException('Combo no encontrado');
        }

        // “Eliminación lógica”: solo desactivar
        combo.isActive = false;
        // opcional, para que no se aplique nunca más automáticamente
        combo.autoApply = false;

        return this.comboRepo.save(combo);
    }

}
