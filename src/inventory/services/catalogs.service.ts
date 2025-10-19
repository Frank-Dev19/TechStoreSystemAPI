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

    updateCategory(id: number, dto: Partial<CreateCategoryDto>) { return this.catRepo.update(id, dto); }

    removeCategory(id: number) { return this.catRepo.delete(id); }

    // UNITS
    createUnit(dto: CreateUnitDto) { return this.unitRepo.save(this.unitRepo.create(dto)); }
    listUnits() { return this.unitRepo.find(); }
    updateUnit(id: number, dto: Partial<CreateUnitDto>) { return this.unitRepo.update(id, dto); }
    removeUnit(id: number) { return this.unitRepo.delete(id); }

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

    listProducts() { return this.prodRepo.find(); }
    removeProduct(id: number) { return this.prodRepo.delete(id); }
}
