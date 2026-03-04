import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CatalogsService } from '../services/catalogs.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { CreateUnitDto } from '../dto/create-unit.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { FilterProductDto } from '../dto/filter-product.dto';
import { FilterCategoryDto } from '../dto/filter-category.dto';
import { FilterUnitDto } from '../dto/filter-unit.dto';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
@UseGuards(JwtAccessGuard)
@Controller('inventory/catalogs')
export class CatalogsController {
    constructor(private readonly svc: CatalogsService) { }

    // categories
    @Get('categories')
    listCats(@Query() filter: FilterCategoryDto) { return this.svc.listCategories(filter); }

    @Post('categories')
    createCat(@Body() dto: CreateCategoryDto) { return this.svc.createCategory(dto); }

    @Put('categories/:id')
    updateCat(@Param('id') id: number, @Body() dto: Partial<CreateCategoryDto>) { return this.svc.updateCategory(+id, dto); }

    @Delete('categories/:id')
    delCat(@Param('id') id: number) { return this.svc.removeCategory(+id); }




    // units
    @Get('units')
    listUnits(@Query() filter: FilterUnitDto) { return this.svc.listUnits(filter); }

    @Post('units')
    createUnit(@Body() dto: CreateUnitDto) { return this.svc.createUnit(dto); }

    @Put('units/:id')
    updateUnit(@Param('id') id: number, @Body() dto: Partial<CreateUnitDto>) { return this.svc.updateUnit(+id, dto); }

    @Delete('units/:id')
    delUnit(@Param('id') id: number) { return this.svc.removeUnit(+id); }





    // products (mapeos front incluidos)
    @Get('products')
    async listProducts(@Query() filter: FilterProductDto) { return await this.svc.listProducts(filter); }

    @Post('products')
    createProduct(@Body() dto: CreateProductDto) { return this.svc.createProduct(dto); }

    @Put('products/:id')
    updateProduct(@Param('id') id: number, @Body() dto: UpdateProductDto) { return this.svc.updateProduct(+id, dto); }

    @Delete('products/:id')
    delProduct(@Param('id') id: number) { return this.svc.removeProduct(+id); }
}
