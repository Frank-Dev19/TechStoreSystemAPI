// src/pricing/services/price-lists.service.ts
import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { PriceList } from '../entities/price-list.entity';
import { CreatePriceListDto } from '../dto/create-price-list.dto';
import { UpdatePriceListDto } from '../dto/update-price-list.dto';

@Injectable()
export class PriceListsService {
    constructor(
        @InjectRepository(PriceList)
        private readonly plRepo: Repository<PriceList>,
    ) { }

    async create(dto: CreatePriceListDto) {
        const exists = await this.plRepo.findOne({
            where: { code: dto.code },
        });
        if (exists) {
            throw new BadRequestException('El código de lista ya existe');
        }

        const pl = this.plRepo.create({
            code: dto.code,
            name: dto.name,
            description: dto.description ?? null,
            type: dto.type,
            isDefault: dto.is_default ?? false,
            // activeFrom: dto.active_from ? new Date(dto.active_from) : null,
            // activeTo: dto.active_to ? new Date(dto.active_to) : null,
            isActive: dto.is_active ?? true,
        });

        // Si se marca como default, quitar default a otras
        if (pl.isDefault) {
            await this.plRepo.update(
                { isDefault: true },
                { isDefault: false },
            );
        }

        return this.plRepo.save(pl);
    }

    async update(id: number, dto: UpdatePriceListDto) {
        const pl = await this.plRepo.findOne({ where: { id } });
        if (!pl) {
            throw new NotFoundException('Lista de precios no encontrada');
        }

        if (dto.code && dto.code !== pl.code) {
            const exists = await this.plRepo.findOne({
                where: { code: dto.code },
            });
            if (exists) {
                throw new BadRequestException('El código de lista ya existe');
            }
        }

        if (dto.code !== undefined) pl.code = dto.code;
        if (dto.name !== undefined) pl.name = dto.name;
        if (dto.description !== undefined) pl.description = dto.description;
        if (dto.type !== undefined) pl.type = dto.type;
        // if (dto.active_from !== undefined) {
        //     pl.activeFrom = dto.active_from ? new Date(dto.active_from) : null;
        // }
        // if (dto.active_to !== undefined) {
        //     pl.activeTo = dto.active_to ? new Date(dto.active_to) : null;
        // }
        if (dto.is_active !== undefined) pl.isActive = dto.is_active;
        if (dto.is_default !== undefined) pl.isDefault = dto.is_default;

        // Asegurarnos de que solo haya una lista default
        if (pl.isDefault) {
            await this.plRepo.update(
                { isDefault: true, id: Not(id) }, // 👈 aquí ya usamos Not
                { isDefault: false },
            );
        }

        return this.plRepo.save(pl);
    }

    list() {
        return this.plRepo.find({
            order: { name: 'ASC' },
        });
    }

    async get(id: number) {
        const pl = await this.plRepo.findOne({ where: { id } });
        if (!pl) {
            throw new NotFoundException('Lista de precios no encontrada');
        }
        return pl;
    }

    async deactivate(id: number) {
        const pl = await this.plRepo.findOne({ where: { id } });
        if (!pl) {
            throw new NotFoundException('Lista de precios no encontrada');
        }
        pl.isActive = false;
        pl.isDefault = false;
        return this.plRepo.save(pl);
    }
}
