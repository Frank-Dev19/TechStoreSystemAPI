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
import { FilterCategoryDto } from '../dto/filter-category.dto';
import { FilterUnitDto } from '../dto/filter-unit.dto';
import { ImportProductsDto } from '../dto/import-products.dto';

@Injectable()
export class CatalogsService {
    constructor(
        @InjectRepository(Category) private catRepo: Repository<Category>,
        @InjectRepository(Unit) private unitRepo: Repository<Unit>,
        @InjectRepository(Product) private prodRepo: Repository<Product>,
    ) { }

    // CATEGORIES
    createCategory(dto: CreateCategoryDto) { return this.catRepo.save(this.catRepo.create(dto)); }

    async listCategories(filter: FilterCategoryDto = {}) {
        const { search, page = 1, limit = 20 } = filter;
        const qb = this.catRepo.createQueryBuilder('c');

        if (search) {
            qb.andWhere('c.name LIKE :search', { search: `%${search}%` });
        }

        const total = await qb.getCount();
        const data = await qb.skip((page - 1) * limit).take(limit).orderBy('c.id', 'DESC').getMany();

        return { data, total, page, limit };
    }

    async updateCategory(id: number, dto: Partial<CreateCategoryDto>) {
        const category = await this.catRepo.findOneBy({ id });
        if (!category) {
            throw new NotFoundException('Categoría no encontrada');
        }

        Object.assign(category, {

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

    async listUnits(filter: FilterUnitDto = {}) {
        const { search, page = 1, limit = 20 } = filter;
        const qb = this.unitRepo.createQueryBuilder('u');

        if (search) {
            qb.andWhere('u.name LIKE :search', { search: `%${search}%` });
        }

        const total = await qb.getCount();
        const data = await qb.skip((page - 1) * limit).take(limit).orderBy('u.id', 'DESC').getMany();

        return { data, total, page, limit };
    }
    async updateUnit(id: number, dto: Partial<CreateUnitDto>) {
        const unit = await this.unitRepo.findOneBy({ id });
        if (!unit) {
            throw new NotFoundException('Unidad no encontrada');
        }

        Object.assign(unit, {

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
            brand: this.cleanBrand(dto.brand),
            categoryId: category.id, baseUnitId: baseUnit.id,
            isSerialized: dto.is_serialized, managesExpiration: dto.manages_expiration,
            warrantyDurationValue: dto.warranty_duration_value ?? 0,
            warrantyDurationUnit: dto.warranty_duration_unit,
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
            brand: dto.brand !== undefined ? this.cleanBrand(dto.brand) : product.brand,
            isSerialized: dto.is_serialized ?? product.isSerialized,
            managesExpiration: dto.manages_expiration ?? product.managesExpiration,
            warrantyDurationValue: dto.warranty_duration_value ?? product.warrantyDurationValue,
            warrantyDurationUnit: dto.warranty_duration_unit ?? product.warrantyDurationUnit,
            minStock: dto.min_stock ?? product.minStock,
            maxStock: dto.max_stock ?? product.maxStock,
            reorderPoint: dto.reorder_point ?? product.reorderPoint,
        });

        return this.prodRepo.save(product);
    }

    async importProducts(dto: ImportProductsDto) {
        const duplicateMode = dto.duplicateMode ?? 'skip';
        const result = {
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [] as { row: number; sku?: string; message: string }[],
        };

        for (let index = 0; index < dto.rows.length; index++) {
            const row = dto.rows[index];
            const rowNumber = index + 1;

            try {
                const sku = row.sku.trim();
                const name = row.name.trim();
                if (!sku || !name) {
                    result.errors.push({ row: rowNumber, sku, message: 'SKU y nombre son obligatorios' });
                    continue;
                }

                const category = await this.catRepo.findOneBy({ id: row.category_id });
                const baseUnit = await this.unitRepo.findOneBy({ id: row.unit_id });
                if (!category || !baseUnit) {
                    result.errors.push({ row: rowNumber, sku, message: 'Categoría o unidad inválida' });
                    continue;
                }

                const existing = await this.prodRepo.findOneBy({ sku });
                if (existing && duplicateMode === 'skip') {
                    result.skipped++;
                    continue;
                }

                if (existing) {
                    Object.assign(existing, {
                        name,
                        description: row.description ?? existing.description,
                        brand: this.cleanBrand(row.brand),
                        categoryId: category.id,
                        baseUnitId: baseUnit.id,
                        isSerialized: row.is_serialized,
                        managesExpiration: row.manages_expiration,
                        warrantyDurationValue: row.warranty_duration_value ?? existing.warrantyDurationValue,
                        warrantyDurationUnit: row.warranty_duration_unit ?? existing.warrantyDurationUnit,
                        minStock: row.min_stock,
                        maxStock: row.max_stock,
                        reorderPoint: row.reorder_point,
                    });
                    await this.prodRepo.save(existing);
                    result.updated++;
                    continue;
                }

                const product = this.prodRepo.create({
                    sku,
                    name,
                    description: row.description ?? null,
                    brand: this.cleanBrand(row.brand),
                    categoryId: category.id,
                    baseUnitId: baseUnit.id,
                    isSerialized: row.is_serialized,
                    managesExpiration: row.manages_expiration,
                    warrantyDurationValue: row.warranty_duration_value ?? 0,
                    warrantyDurationUnit: row.warranty_duration_unit,
                    minStock: row.min_stock,
                    maxStock: row.max_stock,
                    reorderPoint: row.reorder_point,
                });
                await this.prodRepo.save(product);
                result.created++;
            } catch (error) {
                result.errors.push({
                    row: rowNumber,
                    sku: row?.sku,
                    message: error instanceof Error ? error.message : 'Error importando producto',
                });
            }
        }

        return {
            ...result,
            total: dto.rows.length,
        };
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

    async listAllProducts() {
        const products = await this.prodRepo.find({
            relations: ['category', 'baseUnit'],
            order: { id: 'DESC' }
        });
        return products;
    }


    async removeProduct(id: number) {
        const product = await this.prodRepo.findOneBy({ id });
        if (!product) {
            throw new NotFoundException('Producto no encontrado');
        }

        return this.prodRepo.remove(product);
    }

    private cleanBrand(value?: string | null): string | null {
        const brand = (value ?? '').trim();
        if (!brand || brand === '-' || brand === '_' || brand === '__') return null;
        if (brand.toUpperCase() === 'N/A' || brand.toUpperCase() === 'S/M') return null;
        return brand;
    }
}
