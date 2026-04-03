import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { PricingConfig } from '../entities/pricing-config.entity';
import { CreatePricingConfigDto, UpdatePricingConfigDto } from '../dto/pricing-config.dto';
import { Product } from 'src/inventory/entities/product.entity';

@Injectable()
export class PricingConfigService {
    constructor(
        @InjectRepository(PricingConfig)
        private readonly repo: Repository<PricingConfig>,
        @InjectRepository(Product)
        private readonly productRepo: Repository<Product>,
    ) {}

    async findAll(): Promise<PricingConfig[]> {
        return this.repo.find({
            relations: ['product', 'category'],
            order: { id: 'ASC' },
        });
    }

    async findOne(id: number): Promise<PricingConfig> {
        const cfg = await this.repo.findOne({
            where: { id },
            relations: ['product', 'category'],
        });
        if (!cfg) throw new NotFoundException('Configuración no encontrada');
        return cfg;
    }

    /**
     * Resolver la configuración que aplica a un producto.
     * Prioridad: producto > categoría > global
     */
    async resolveForProduct(productId: number): Promise<{
        config: PricingConfig;
        scope: 'product' | 'category' | 'global';
    }> {
        // 1) Buscar config por producto
        const byProduct = await this.repo.findOne({
            where: { productId, isActive: true },
        });
        if (byProduct) return { config: byProduct, scope: 'product' };

        // 2) Buscar config por categoría del producto
        const product = await this.productRepo.findOne({
            where: { id: productId },
            relations: ['category'],
        });
        if (!product) throw new NotFoundException('Producto no encontrado');

        if (product.categoryId) {
            const byCat = await this.repo.findOne({
                where: {
                    categoryId: product.categoryId,
                    productId: IsNull(),
                    isActive: true,
                },
            });
            if (byCat) return { config: byCat, scope: 'category' };
        }

        // 3) Buscar config global
        const global = await this.repo.findOne({
            where: {
                productId: IsNull(),
                categoryId: IsNull(),
                isActive: true,
            },
        });
        if (global) return { config: global, scope: 'global' };

        throw new BadRequestException(
            `No hay configuración de márgenes para el producto "${product.name}". Configure un margen global, por categoría o por producto.`,
        );
    }

    async create(dto: CreatePricingConfigDto): Promise<PricingConfig> {
        // Validar que no haya duplicado
        const existing = await this.repo.findOne({
            where: {
                productId: dto.product_id ?? IsNull(),
                categoryId: dto.category_id ?? IsNull(),
            } as any,
        });

        if (existing) {
            throw new BadRequestException(
                'Ya existe una configuración para este alcance (producto/categoría/global)',
            );
        }

        const cfg = this.repo.create({
            productId: dto.product_id ?? null,
            categoryId: dto.category_id ?? null,
            profitMarginPct: dto.profit_margin_pct,
            maxDiscountPct: dto.max_discount_pct,
            isActive: dto.is_active ?? true,
        });

        return this.repo.save(cfg);
    }

    async update(id: number, dto: UpdatePricingConfigDto): Promise<PricingConfig> {
        const cfg = await this.findOne(id);

        if (dto.profit_margin_pct !== undefined) cfg.profitMarginPct = dto.profit_margin_pct;
        if (dto.max_discount_pct !== undefined) cfg.maxDiscountPct = dto.max_discount_pct;
        if (dto.is_active !== undefined) cfg.isActive = dto.is_active;

        return this.repo.save(cfg);
    }

    async remove(id: number): Promise<void> {
        const cfg = await this.findOne(id);
        await this.repo.remove(cfg);
    }
}
