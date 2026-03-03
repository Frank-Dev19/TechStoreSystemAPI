import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { Unit } from '../entities/unit.entity';
import { Product } from '../entities/product.entity';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { CreateUnitDto } from '../dto/create-unit.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { FilterProductDto } from '../dto/filter-product.dto';

@Injectable()
export class CatalogsService {
    constructor(
        @InjectRepository(Category) private catRepo: Repository<Category>,
        @InjectRepository(Unit) private unitRepo: Repository<Unit>,
        @InjectRepository(Product) private prodRepo: Repository<Product>,
    ) { }

    // CATEGORIES
    createCategory(dto: CreateCategoryDto) { return this.catRepo.save(this.catRepo.create(dto)); }

    listCategories() { return this.catRepo.find(); }

    async updateCategory(id: number, dto: Partial<CreateCategoryDto>) {
        const category = await this.catRepo.findOneBy({ id });
        if (!category) {
            throw new NotFoundException('Categoría no encontrada');
        }

        Object.assign(category, {
            code: dto.code ?? category.code,
            name: dto.name ?? category.name,
            description: dto.description ?? category.description,
        });

        return this.catRepo.save(category);   // ← IMPORTANTE: save()
    }

    async removeCategory(id: number) {
        const category = await this.catRepo.findOneBy({ id });
        if (!category) {
            throw new NotFoundException('Categoría no encontrada');
        }

        // 👇 esto sí dispara afterRemove en el subscriber
        return this.catRepo.remove(category);
    }

    // UNITS
    createUnit(dto: CreateUnitDto) { return this.unitRepo.save(this.unitRepo.create(dto)); }
    listUnits() { return this.unitRepo.find(); }
    async updateUnit(id: number, dto: Partial<CreateUnitDto>) {
        const unit = await this.unitRepo.findOneBy({ id });
        if (!unit) {
            throw new NotFoundException('Unidad no encontrada');
        }

        Object.assign(unit, {
            code: dto.code ?? unit.code,
            name: dto.name ?? unit.name,
            abbreviation: dto.abbreviation ?? unit.abbreviation,
        });

        return this.unitRepo.save(unit);      // ← IMPORTANTE: save()
    }

    async removeUnit(id: number) {
        const unit = await this.unitRepo.findOneBy({ id });
        if (!unit) {
            throw new NotFoundException('Unidad no encontrada');
        }

        return this.unitRepo.remove(unit);
    }

    // PRODUCTS (aceptamos unit_id del front)
    async createProduct(dto: CreateProductDto) {
        const category = await this.catRepo.findOneBy({ id: dto.category_id });
        const baseUnit = await this.unitRepo.findOneBy({ id: dto.unit_id });
        if (!category || !baseUnit) throw new BadRequestException('Categoría o Unidad inválida');

        const product = this.prodRepo.create({
            sku: dto.sku, name: dto.name, description: dto.description,
            categoryId: category.id, baseUnitId: baseUnit.id,
            isSerialized: dto.is_serialized, managesExpiration: dto.manages_expiration,
            minStock: dto.min_stock, maxStock: dto.max_stock, reorderPoint: dto.reorder_point,
        });
        return this.prodRepo.save(product);
    }

    async updateProduct(id: number, dto: UpdateProductDto) {
        const product = await this.prodRepo.findOneBy({ id });
        if (!product) throw new NotFoundException('Producto no encontrado');

        if (dto.category_id) product.categoryId = dto.category_id;
        if (dto.unit_id) product.baseUnitId = dto.unit_id;

        Object.assign(product, {
            sku: dto.sku ?? product.sku,
            name: dto.name ?? product.name,
            description: dto.description ?? product.description,
            isSerialized: dto.is_serialized ?? product.isSerialized,
            managesExpiration: dto.manages_expiration ?? product.managesExpiration,
            minStock: dto.min_stock ?? product.minStock,
            maxStock: dto.max_stock ?? product.maxStock,
            reorderPoint: dto.reorder_point ?? product.reorderPoint,
        });

        return this.prodRepo.save(product);
    }

    async listProducts(filter: FilterProductDto) {
        const { search, categoryId, page = 1, limit = 20 } = filter;
        const qb = this.prodRepo.createQueryBuilder('p')
            .leftJoinAndSelect('p.category', 'category')
            .leftJoinAndSelect('p.baseUnit', 'baseUnit');

        if (search) {
            qb.andWhere('(p.name LIKE :search OR p.sku LIKE :search)', { search: `%${search}%` });
        }
        if (categoryId) {
            qb.andWhere('p.categoryId = :categoryId', { categoryId });
        }

        const total = await qb.getCount();
        const data = await qb.skip((page - 1) * limit).take(limit).orderBy('p.id', 'DESC').getMany();

        return { data, total, page, limit };
    }


    async removeProduct(id: number) {
        const product = await this.prodRepo.findOneBy({ id });
        if (!product) {
            throw new NotFoundException('Producto no encontrado');
        }

        return this.prodRepo.remove(product);
    }
}
