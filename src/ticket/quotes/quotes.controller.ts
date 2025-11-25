import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { RolesGuard } from '../../rbac/guards/roles.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Roles as RolesDec } from '../../rbac/decorators/roles.decorator';
import { Permissions } from '../../rbac/decorators/permissions.decorator';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { BulkOperationsDto } from '../../common/dtos/bulk-ids.dto';

@UseGuards(JwtAccessGuard, RolesGuard, PermissionsGuard)
@RolesDec('admin')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Permissions('quote.read')
  @Get()
  findAll(@Query() query: any) {
    return this.quotesService.findAll(query);
  }

  @Permissions('quote.read')
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('withDeleted') withDeleted?: string,
  ) {
    return this.quotesService.findOne(id, withDeleted === 'true');
  }

  @Permissions('quote.create')
  @Post()
  create(@Body() dto: CreateQuoteDto) {
    return this.quotesService.create(dto);
  }

  @Permissions('quote.update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuoteDto) {
    return this.quotesService.update(id, dto);
  }

  @Permissions('quote.delete')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.quotesService.softDelete(id);
  }

  @Permissions('quote.restore')
  @Patch(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.quotesService.restore(id);
  }

  @Permissions('quote.delete')
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkOperationsDto) {
    return this.quotesService.bulkSoftDelete(dto.ids);
  }

  @Permissions('quote.restore')
  @Post('bulk-restore')
  bulkRestore(@Body() dto: BulkOperationsDto) {
    return this.quotesService.bulkRestore(dto.ids);
  }
}
