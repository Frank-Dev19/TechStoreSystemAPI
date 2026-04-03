import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxConfig } from '../entities/tax-config.entity';
import { CreateTaxConfigDto, UpdateTaxConfigDto } from '../dto/tax-config.dto';

@Injectable()
export class TaxConfigService {
    constructor(
        @InjectRepository(TaxConfig)
        private readonly repo: Repository<TaxConfig>,
    ) {}

    async findAll(): Promise<TaxConfig[]> {
        return this.repo.find({ order: { id: 'ASC' } });
    }

    async findByCode(code: string): Promise<TaxConfig | null> {
        return this.repo.findOne({ where: { code, isActive: true } });
    }

    async getIGVRate(): Promise<number> {
        const igv = await this.findByCode('IGV');
        return igv ? Number(igv.ratePct) : 18;
    }

    async getRentaRate(): Promise<number> {
        const renta = await this.findByCode('RENTA');
        return renta ? Number(renta.ratePct) : 1.5;
    }

    async create(dto: CreateTaxConfigDto): Promise<TaxConfig> {
        const tax = this.repo.create({
            code: dto.code.toUpperCase(),
            name: dto.name,
            ratePct: dto.rate_pct,
            isFixed: dto.is_fixed ?? false,
            appliesTo: dto.applies_to ?? 'SALE_PRICE',
            isActive: dto.is_active ?? true,
        });
        return this.repo.save(tax);
    }

    async update(id: number, dto: UpdateTaxConfigDto): Promise<TaxConfig> {
        const tax = await this.repo.findOneBy({ id });
        if (!tax) throw new NotFoundException('Impuesto no encontrado');

        if (dto.name !== undefined) tax.name = dto.name;
        if (dto.rate_pct !== undefined) tax.ratePct = dto.rate_pct;
        if (dto.is_active !== undefined) tax.isActive = dto.is_active;

        return this.repo.save(tax);
    }

    /**
     * Semilla inicial: crea IGV y RENTA si no existen.
     */
    async seed(): Promise<void> {
        const igv = await this.findByCode('IGV');
        if (!igv) {
            await this.create({
                code: 'IGV',
                name: 'Impuesto General a las Ventas',
                rate_pct: 18,
                is_fixed: true,
                applies_to: 'SALE_PRICE',
            });
        }

        const renta = await this.findByCode('RENTA');
        if (!renta) {
            await this.create({
                code: 'RENTA',
                name: 'Impuesto a la Renta (pago a cuenta)',
                rate_pct: 1.5,
                is_fixed: false,
                applies_to: 'MONTHLY_REVENUE',
            });
        }
    }
}
