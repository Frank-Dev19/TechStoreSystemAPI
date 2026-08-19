import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CatalogsService } from '../services/catalogs.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { CreateUnitDto } from '../dto/create-unit.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { FilterProductDto } from '../dto/filter-product.dto';
import { FilterCategoryDto } from '../dto/filter-category.dto';
import { FilterUnitDto } from '../dto/filter-unit.dto';
import { ImportProductsDto } from '../dto/import-products.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { Permissions } from 'src/rbac/decorators/permissions.decorator';
import { PermissionsGuard } from 'src/rbac/guards/permissions.guard';
@UseGuards(JwtAccessGuard, PermissionsGuard)
@Permissions('inventory-products.read')
@Controller('inventory/catalogs')
export class CatalogsController {
    constructor(private readonly svc: CatalogsService) { }

    // categories
    @Get('categories')
    listCats(@Query() filter: FilterCategoryDto) { return this.svc.listCategories(filter); }

    @Post('categories')
    @Permissions('inventory-products.manage')
    createCat(@Body() dto: CreateCategoryDto) { return this.svc.createCategory(dto); }

    @Put('categories/:id')
    @Permissions('inventory-products.manage')
    updateCat(@Param('id') id: number, @Body() dto: Partial<CreateCategoryDto>) { return this.svc.updateCategory(+id, dto); }

    @Delete('categories/:id')
    @Permissions('inventory-products.manage')
    delCat(@Param('id') id: number) { return this.svc.removeCategory(+id); }




    // units
    @Get('units')
    listUnits(@Query() filter: FilterUnitDto) { return this.svc.listUnits(filter); }

    @Post('units')
    @Permissions('inventory-products.manage')
    createUnit(@Body() dto: CreateUnitDto) { return this.svc.createUnit(dto); }

    @Put('units/:id')
    @Permissions('inventory-products.manage')
    updateUnit(@Param('id') id: number, @Body() dto: Partial<CreateUnitDto>) { return this.svc.updateUnit(+id, dto); }

    @Delete('units/:id')
    @Permissions('inventory-products.manage')
    delUnit(@Param('id') id: number) { return this.svc.removeUnit(+id); }





    // products (mapeos front incluidos)
    @Get('products')
    async listProducts(@Query() filter: FilterProductDto) { return await this.svc.listProducts(filter); }

    // products all (sin paginación, para autocompletes)
    @Get('products/all')
    async listAllProducts() { return await this.svc.listAllProducts(); }

    @Post('products')
    @Permissions('inventory-products.manage')
    createProduct(@Body() dto: CreateProductDto) { return this.svc.createProduct(dto); }

    @Post('products/import')
    @Permissions('inventory-products.manage')
    importProducts(@Body() dto: ImportProductsDto) { return this.svc.importProducts(dto); }

    @Put('products/:id')
    @Permissions('inventory-products.manage')
    updateProduct(@Param('id') id: number, @Body() dto: UpdateProductDto) { return this.svc.updateProduct(+id, dto); }

    @Delete('products/:id')
    @Permissions('inventory-products.manage')
    delProduct(@Param('id') id: number) { return this.svc.removeProduct(+id); }
}
