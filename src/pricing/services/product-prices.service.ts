// src/pricing/services/product-prices.service.ts
import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { ProductPrice } from '../entities/product-price.entity';
import { CreateProductPriceDto } from '../dto/create-product-price.dto';
import { UpdateProductPriceDto } from '../dto/update-product-price.dto';
import { Product } from 'src/inventory/entities/product.entity';
import { PriceList } from '../entities/price-list.entity';

@Injectable()
export class ProductPricesService {
    constructor(
        @InjectRepository(ProductPrice)
        private readonly ppRepo: Repository<ProductPrice>,
        @InjectRepository(Product)
        private readonly prodRepo: Repository<Product>,
        @InjectRepository(PriceList)
        private readonly plRepo: Repository<PriceList>,
    ) { }

    async create(dto: CreateProductPriceDto) {
        const product = await this.prodRepo.findOne({
            where: { id: dto.product_id },
        });
        if (!product) {
            throw new BadRequestException('Producto no válido');
        }

        const pl = await this.plRepo.findOne({
            where: { id: dto.price_list_id },
        });
        if (!pl) {
            throw new BadRequestException('Lista de precios no válida');
        }

        const pp = this.ppRepo.create({
            productId: product.id,
            priceListId: pl.id,
            unitPrice: dto.unit_price,
            currencyCode: dto.currency_code ?? 'PEN',
            minQty: dto.min_qty,
            maxQty: dto.max_qty ?? null,
            // validFrom: dto.valid_from ? new Date(dto.valid_from) : null,
            // validTo: dto.valid_to ? new Date(dto.valid_to) : null,
            isActive: dto.is_active ?? true,
        });

        return this.ppRepo.save(pp);
    }

    async update(id: number, dto: UpdateProductPriceDto) {
        const pp = await this.ppRepo.findOne({ where: { id } });
        if (!pp) {
            throw new NotFoundException('Precio no encontrado');
        }

        if (dto.product_id) {
            const prod = await this.prodRepo.findOne({
                where: { id: dto.product_id },
            });
            if (!prod) throw new BadRequestException('Producto no válido');
            pp.productId = prod.id;
        }

        if (dto.price_list_id) {
            const pl = await this.plRepo.findOne({
                where: { id: dto.price_list_id },
            });
            if (!pl) throw new BadRequestException('Lista de precios no válida');
            pp.priceListId = pl.id;
        }

        if (dto.unit_price !== undefined) pp.unitPrice = dto.unit_price;
        if (dto.currency_code !== undefined)
            pp.currencyCode = dto.currency_code || 'PEN';
        if (dto.min_qty !== undefined) pp.minQty = dto.min_qty;
        if (dto.max_qty !== undefined) pp.maxQty = dto.max_qty ?? null;
        // if (dto.valid_from !== undefined) {
        //     pp.validFrom = dto.valid_from ? new Date(dto.valid_from) : null;
        // }
        // if (dto.valid_to !== undefined) {
        //     pp.validTo = dto.valid_to ? new Date(dto.valid_to) : null;
        // }
        if (dto.is_active !== undefined) pp.isActive = dto.is_active;

        return this.ppRepo.save(pp);
    }

    listByProduct(productId: number, activeOnly?: boolean) {
        const where: any = { productId };

        if (activeOnly === true) {
            where.isActive = true;
        }

        return this.ppRepo.find({
            where,
            order: { priceListId: 'ASC', minQty: 'ASC' },
        });
    }

    listByPriceList(priceListId: number, activeOnly?: boolean) {
        const where: any = { priceListId };

        if (activeOnly === true) {
            where.isActive = true;
        }

        return this.ppRepo.find({
            where,
            order: { productId: 'ASC', minQty: 'ASC' },
        });
    }

    async remove(id: number) {
        const pp = await this.ppRepo.findOne({ where: { id } });
        if (!pp) {
            throw new NotFoundException('Precio no encontrado');
        }

        pp.isActive = false;
        return this.ppRepo.save(pp);
    }


    async getCoverageForPriceList(priceListId: number) {
        // Todos los productos, con LEFT JOIN a product_prices para esa lista
        const rows = await this.prodRepo
            .createQueryBuilder('p')
            .leftJoin(
                ProductPrice,
                'pp',
                'pp.productId = p.id AND pp.priceListId = :plId AND pp.isActive = 1',
                { plId: priceListId },
            )
            .select([
                'p.id AS productId',
                'p.name AS name',
                'p.sku AS sku',
                'pp.id AS priceId',
            ])
            .orderBy('p.name', 'ASC')
            .getRawMany();

        const totalProducts = rows.length;
        const pricedProducts = rows.filter((r) => r.priceId !== null).length;
        const unpricedProducts = totalProducts - pricedProducts;

        const items = rows
            .filter((r) => r.priceId === null)
            .map((r) => ({
                productId: Number(r.productId),
                name: r.name as string,
                sku: r.sku as string,
            }));

        return {
            totalProducts,
            pricedProducts,
            unpricedProducts,
            items,
        };
    }


}
