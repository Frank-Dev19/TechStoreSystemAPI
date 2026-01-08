// src/pricing/services/discount-rules.service.ts
import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, IsNull, Like } from 'typeorm';
import { DiscountRule } from '../entities/discount-rule.entity';
import { CreateDiscountRuleDto } from '../dto/create-discount-rule.dto';
import { UpdateDiscountRuleDto } from '../dto/update-discount-rule.dto';
import { Product } from 'src/inventory/entities/product.entity';
import { Category } from 'src/inventory/entities/category.entity';
import { PriceList } from '../entities/price-list.entity';

@Injectable()
export class DiscountRulesService {
    constructor(
        @InjectRepository(DiscountRule)
        private readonly drRepo: Repository<DiscountRule>,
        @InjectRepository(Product)
        private readonly prodRepo: Repository<Product>,
        @InjectRepository(Category)
        private readonly catRepo: Repository<Category>,
        @InjectRepository(PriceList)
        private readonly plRepo: Repository<PriceList>,
    ) { }

    async create(dto: CreateDiscountRuleDto) {
        let productId: number | null = null;
        let categoryId: number | null = null;
        let priceListId: number | null = null;

        if (dto.product_id) {
            const prod = await this.prodRepo.findOne({
                where: { id: dto.product_id },
            });
            if (!prod) throw new BadRequestException('Producto inválido');
            productId = prod.id;
        }

        if (dto.category_id) {
            const cat = await this.catRepo.findOne({
                where: { id: dto.category_id },
            });
            if (!cat) throw new BadRequestException('Categoría inválida');
            categoryId = cat.id;
        }

        if (dto.price_list_id) {
            const pl = await this.plRepo.findOne({
                where: { id: dto.price_list_id },
            });
            if (!pl) throw new BadRequestException('Lista de precios inválida');
            priceListId = pl.id;
        }

        if (dto.starts_at && dto.ends_at) {
            const startDate = new Date(dto.starts_at);
            const endDate = new Date(dto.ends_at);

            if (endDate < startDate) {
                throw new BadRequestException('La fecha de fin no puede ser anterior a la fecha de inicio');
            }
        }


        // Determinar isActive inicial basado en fecha de inicio
        let initialIsActive = dto.is_active ?? true;
        if (dto.starts_at) {
            const startDate = new Date(dto.starts_at);
            const today = new Date();
            const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

            // Si la fecha de inicio es futura, desactivar
            if (startDateOnly > todayDateOnly) {
                initialIsActive = false;
            }
        }

        const dr = this.drRepo.create({
            name: dto.name,
            description: dto.description ?? null,
            productId,
            categoryId,
            priceListId,
            discountType: dto.discount_type,
            amount: dto.amount,
            minQty: dto.min_qty ?? null,
            maxQty: dto.max_qty ?? null,
            autoApply: dto.auto_apply ?? true,
            requiresPermission: dto.requires_permission ?? null,
            startsAt: dto.starts_at ? new Date(dto.starts_at) : null,
            endsAt: dto.ends_at ? new Date(dto.ends_at) : null,
            priority: dto.priority ?? 0,
            isExclusive: dto.is_exclusive ?? false,
            isActive: initialIsActive,
        });

        return this.drRepo.save(dr);
    }

    async update(id: number, dto: UpdateDiscountRuleDto) {
        const dr = await this.drRepo.findOne({ where: { id } });
        if (!dr) {
            throw new NotFoundException('Regla de descuento no encontrada');
        }

        if (dto.product_id !== undefined) {
            if (dto.product_id === null) {
                dr.productId = null;
            } else {
                const prod = await this.prodRepo.findOne({
                    where: { id: dto.product_id },
                });
                if (!prod) throw new BadRequestException('Producto inválido');
                dr.productId = prod.id;
            }
        }

        if (dto.category_id !== undefined) {
            if (dto.category_id === null) dr.categoryId = null;
            else {
                const cat = await this.catRepo.findOne({
                    where: { id: dto.category_id },
                });
                if (!cat) throw new BadRequestException('Categoría inválida');
                dr.categoryId = cat.id;
            }
        }

        if (dto.price_list_id !== undefined) {
            if (dto.price_list_id === null) dr.priceListId = null;
            else {
                const pl = await this.plRepo.findOne({
                    where: { id: dto.price_list_id },
                });
                if (!pl) throw new BadRequestException('Lista de precios inválida');
                dr.priceListId = pl.id;
            }
        }

        if (dto.name !== undefined) dr.name = dto.name;
        if (dto.description !== undefined) dr.description = dto.description;
        if (dto.discount_type !== undefined) dr.discountType = dto.discount_type;
        if (dto.amount !== undefined) dr.amount = dto.amount;
        if (dto.min_qty !== undefined) dr.minQty = dto.min_qty ?? null;
        if (dto.max_qty !== undefined) dr.maxQty = dto.max_qty ?? null;
        if (dto.auto_apply !== undefined) dr.autoApply = dto.auto_apply;
        if (dto.requires_permission !== undefined)
            dr.requiresPermission = dto.requires_permission ?? null;
        if (dto.starts_at !== undefined)
            dr.startsAt = dto.starts_at ? new Date(dto.starts_at) : null;
        if (dto.ends_at !== undefined)
            dr.endsAt = dto.ends_at ? new Date(dto.ends_at) : null;
        if (dto.priority !== undefined) dr.priority = dto.priority;
        if (dto.is_exclusive !== undefined) dr.isExclusive = dto.is_exclusive;
        if (dto.is_active !== undefined) dr.isActive = dto.is_active;

        return this.drRepo.save(dr);
    }

    async remove(id: number) {
        const dr = await this.drRepo.findOne({ where: { id } });
        if (!dr) {
            throw new NotFoundException('Regla no encontrada');
        }

        dr.isActive = false;
        return this.drRepo.save(dr);   // 👈 solo lo desactiva
    }

    // Filtros simples (puedes extender según necesites)
    async list(filters?: {
        product_id?: number;
        category_id?: number;
        price_list_id?: number;
        active_only?: boolean;
        page?: number;
        limit?: number;
        search?: string;
    }) {
        const where: any = {};

        if (filters?.product_id !== undefined) {
            where.productId = filters.product_id;
        }
        if (filters?.category_id !== undefined) {
            where.categoryId = filters.category_id;
        }
        if (filters?.price_list_id !== undefined) {
            where.priceListId = filters.price_list_id;
        }
        if (filters?.active_only === true) {
            where.isActive = true;
        }

        if (filters?.search) {
            const searchTerm = filters.search.toLowerCase();
            where.name = Like(`%${searchTerm}%`);
        }

        // Paginación
        const page = filters?.page ?? 1;
        const limit = filters?.limit ?? 10;
        const skip = (page - 1) * limit;

        // Contar total de registros
        const total = await this.drRepo.count({ where });

        // Obtener datos con paginación
        const data = await this.drRepo.find({
            where,
            order: { priority: 'DESC', id: 'ASC' },
            relations: ['product', 'category', 'priceList'],
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


    // Método para obtener TODOS los descuentos
    async findAll(filters?: {
        product_id?: number;
        category_id?: number;
        price_list_id?: number;
        active_only?: boolean;
    }) {
        const where: any = {};

        if (filters?.product_id !== undefined) {
            where.productId = filters.product_id;
        }
        if (filters?.category_id !== undefined) {
            where.categoryId = filters.category_id;
        }
        if (filters?.price_list_id !== undefined) {
            where.priceListId = filters.price_list_id;
        }
        if (filters?.active_only === true) {
            where.isActive = true;
        }

        return this.drRepo.find({
            where,
            order: { priority: 'DESC', id: 'ASC' },
            relations: ['product', 'category', 'priceList'],
        });
    }

    async findAllWithAutoDeactivation(filters?: {
        product_id?: number;
        category_id?: number;
        price_list_id?: number;
        active_only?: boolean;
    }) {
        // PRIMERO: Gestionar validez automáticamente
        await this.autoManageDiscountValidity();

        return this.findAll(filters);
    }

    async listWithAutoDeactivation(filters: {
        product_id?: number;
        category_id?: number;
        price_list_id?: number;
        active_only?: boolean;
        page?: number,
        limit?: number,
    }) {
        // PRIMERO: Gestionar validez automáticamente
        await this.autoManageDiscountValidity();

        // LUEGO: Listar normalmente
        return this.list(filters);
    }


    private async autoManageDiscountValidity(): Promise<void> {
        const today = new Date();
        const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        // 1. Desactivar descuentos expirados
        const expired = await this.drRepo
            .createQueryBuilder('d')
            .where('d.isActive = :active', { active: true })
            .andWhere('d.endsAt IS NOT NULL')
            .andWhere('DATE(d.endsAt) < DATE(:today)', { today: todayDateOnly })
            .getMany();

        // 2. Activar descuentos cuya fecha de inicio ha llegado
        const toActivate = await this.drRepo
            .createQueryBuilder('d')
            .where('d.isActive = :active', { active: false })
            .andWhere('d.startsAt IS NOT NULL')
            .andWhere('DATE(d.startsAt) <= DATE(:today)', { today: todayDateOnly })
            .andWhere('(d.endsAt IS NULL OR DATE(d.endsAt) >= DATE(:today))', { today: todayDateOnly })
            .getMany();

        // 3. Desactivar descuentos con inicio futuro
        const futureStart = await this.drRepo
            .createQueryBuilder('d')
            .where('d.isActive = :active', { active: true })
            .andWhere('d.startsAt IS NOT NULL')
            .andWhere('DATE(d.startsAt) > DATE(:today)', { today: todayDateOnly })
            .getMany();

        // Aplicar cambios
        if (expired.length > 0) {
            for (const d of expired) {
                d.isActive = false;
            }
            await this.drRepo.save(expired);
        }

        if (toActivate.length > 0) {
            for (const d of toActivate) {
                d.isActive = true;
            }
            await this.drRepo.save(toActivate);
        }

        if (futureStart.length > 0) {
            for (const d of futureStart) {
                d.isActive = false;
            }
            await this.drRepo.save(futureStart);
        }
    }







    // También actualizar el método anterior para que use esta nueva lógica
    private async autoDeactivateExpired(): Promise<void> {
        // Usar el nuevo método que maneja ambas fechas
        await this.autoManageDiscountValidity();
    }

}
