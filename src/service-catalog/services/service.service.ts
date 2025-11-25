import {
    ConflictException,
    Injectable,
    NotFoundException,
    BadRequestException,
    HttpException,
    HttpStatus,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, ILike, Not, In } from "typeorm";
import { Service } from "../entities/service.entity";
import { ServiceCategory } from "../entities/service-category.entity";
import { CreateServiceDto } from "../dto/create-service.dto";
import { UpdateServiceDto } from "../dto/update-service.dto";

type FindAllQuery = {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: string;
    withDeleted?: string;
    categoryId?: number;
}

@Injectable()
export class ServiceService {
    constructor(
        @InjectRepository(Service)
        private readonly serviceRepository: Repository<Service>,
        @InjectRepository(ServiceCategory)
        private readonly serviceCategoryRepository: Repository<ServiceCategory>,
    ) {}

    /**
     * Crea un nuevo servicio con código auto-generado
     * Implementa retry logic para manejar race conditions
     */
    async create(dto: CreateServiceDto): Promise<Service> {
        const maxRetries = 3;
        let lastError: any;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Generar código automáticamente
                const code = await this.generateNextCode();

                // Verificar si existe la categoría
                const category = await this.serviceCategoryRepository.findOne({ where: {id: dto.categoryId}})
                if (!category) throw new NotFoundException(`Category with id ${dto.categoryId} not found`);

                const service = this.serviceRepository.create({
                    ...dto,
                    code,
                });

                return await this.serviceRepository.save(service);

            } catch (error) {
                // Re-lanzar los errores de negocio sin reintentar
                if (
                    error instanceof ConflictException ||
                    error instanceof HttpException ||
                    error instanceof BadRequestException
                ) {
                    throw error;
                }

                lastError = error;

                // Verificar si es error de código duplicado (solo para race conditions)
                const isDuplicate =
                    error.code === 'ER_DUP_ENTRY' ||      // MySQL
                    error.code === '23505' ||              // PostgreSQL
                    error.message?.includes('duplicate') ||
                    error.message?.includes('unique');

                if (isDuplicate) {
                    if (attempt < maxRetries - 1) {
                        // Esperar tiempo aleatorio (10-50ms) antes de reintentar
                        await new Promise(resolve =>
                            setTimeout(resolve, 10 + Math.random() * 40)
                        );
                        continue; // Reintentar
                    }
                    // Si es el último intento y es duplicado, dejar que el loop termine
                    // para que se lance el ConflictException al final
                } else {
                    // Si NO es un error de duplicado, lanzarlo inmediatamente
                    throw error;
                }
            }
        }

        throw new ConflictException(
            `Could not generate a unique code after ${maxRetries} attempts`
        );
    }

    /**
     * Obtiene todas los servicios con paginación
     * Soporta filtrado por isActive e inclusión de soft-deleted
     */
    async findAll(query: FindAllQuery) {
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));

        if (isNaN(page) || page <= 0) {
            throw new BadRequestException('Page number must be a positive number');
        }

        if (isNaN(limit) || limit <= 0) {
            throw new BadRequestException('Limit must be a positive number');
        }

        // Determinar si incluir soft-deleted
        const includeDeleted = query.withDeleted === 'true';

        const where: any[] = [];
        const baseCondition: any = {};

        // Filtrar por estado activo/inactivo si se especifica
        if (query.isActive !== undefined) {
            if (query.isActive !== 'true' && query.isActive !== 'false') {
                throw new BadRequestException('isActive must be either true or false');
            }
            baseCondition.isActive = query.isActive === 'true';
        }

        // Filtrar por categoría si se especifica
        if (query.categoryId !== undefined) {
            const parseId = Number(query.categoryId);
            if (Number.isNaN(parseId) || parseId <= 0) {
                throw new BadRequestException('CategoryId must be a positive number');
            }
            baseCondition.category = { id: parseId };
        }

        // Búsqueda por texto (parcial, insensible a mayúsculas)
        const searchTerm = query.search?.trim();
        if (searchTerm) {
            // Buscar en nombre, código o descripción
            where.push(
                { ...baseCondition, name: ILike(`%${searchTerm}%`) },
                { ...baseCondition, code: ILike(`%${searchTerm}%`) },
                { ...baseCondition, description: ILike(`%${searchTerm}%`) },
            );
        } else {
            where.push(baseCondition);
        }

        const [data, total] = await this.serviceRepository.findAndCount({
            where: where.length ? where : baseCondition,
            order: { name: 'ASC' },
            skip: (page - 1) * limit,
            take: limit,
            withDeleted: includeDeleted,
        });

        return {
            data,
            total,
            page,
            limit,
        };
    }

    /**
     * Obtiene un servicio por ID
     */
    async findOne(id: number): Promise<Service> {
        const service = await this.serviceRepository.findOne({
            where: { id },
        });

        if (!service) throw new NotFoundException(`Service with id ${id} not found`);

        return service;
    }

    /**
     * Actualiza un servicio
     */
    async update(id: number, dto: UpdateServiceDto): Promise<Service> {
        const service = await this.findOne(id);

        if (dto.categoryId) {
            const category = await this.serviceCategoryRepository.findOne({ where: {id: dto.categoryId}})
            if (!category) throw new NotFoundException(`Category with id ${dto.categoryId} not found`);
        }

        Object.assign(service, dto);

        return await this.serviceRepository.save(service);
    }

    /**
     * Soft delete de un servicio
     */
    async softDelete(id: number) {
        await this.findOne(id);
        await this.serviceRepository.softDelete(id);
        return { ok: true, message: `Service with id ${id} deleted successfully` };
    }

    /**
     * Restaura un servicio soft-deleted
     */
    async restore(id: number) {
        const service = await this.serviceRepository.findOne({
            where: { id },
            withDeleted: true
        });

        if (!service) {
            throw new NotFoundException(`Category with id ${id} not found`);
        }

        if (!service.deletedAt) {
            return { ok: true, message: 'Service already active' };
        }

        service.deletedAt = null;
        await this.serviceRepository.save(service);

        return { ok: true, message: `Service with id ${id} restored successfully` };
    }

    /**
     * Elimina múltiples categorías (soft delete)
     */
    async bulkSoftDelete(ids: number[]) {
        if (!ids?.length) {
            throw new BadRequestException('No ids provided');
        }

        const count = await this.serviceRepository.count({ where: { id: In(ids) } });
        if (!count) {
            throw new NotFoundException(`Services with ids ${ids.join(', ')} not found`);
        }

        await this.serviceRepository.softDelete(ids);

        return { ok: true, message: `${count} services deleted successfully` };
    }

    /**
     * Restaura múltiples servicios soft-deleted
     */
    async bulkRestore(ids: number[]) {
        if (!ids?.length) {
            throw new BadRequestException('No ids provided');
        }

        const count = await this.serviceRepository.count({
            where: { id: In(ids) },
            withDeleted: true
        });

        if (!count) {
            throw new NotFoundException(`Services with ids ${ids.join(', ')} not found`);
        }

        let restoredCount = 0;

        for (const id of ids) {
            const service = await this.serviceRepository.findOne({
                where: { id },
                withDeleted: true
            });

            if (!service) {
                throw new NotFoundException(`Service with id ${id} not found`);
            }

            if (service.deletedAt) {
                service.deletedAt = null;
                await this.serviceRepository.save(service);
                restoredCount++;
            }
        }

        return { ok: true, message: `${restoredCount} services restored successfully` };
    }

    /**
     * Genera el siguiente código automático en formato "S-XXXXXX"
     * @private
     */
    private async generateNextCode(): Promise<string> {
        // Buscar el último servicio con código que empiece con "S-"
        const lastService = await this.serviceRepository
            .createQueryBuilder('service')
            .withDeleted()
            .where('service.code LIKE :pattern', { pattern: 'S-%' })
            .orderBy('service.code', 'DESC')
            .limit(1)
            .getOne();

        if (!lastService) {
            // Primera servicio, empezar en S-000001
            return 'S-000001';
        }

        // Extraer el número del último código: "S-000045" -> "000045"
        const lastCode = lastService.code;
        const numberPart = lastCode.split('-')[1];

        if (!numberPart || isNaN(parseInt(numberPart, 10))) {
            // Si el formato no es válido, empezar de nuevo
            return 'S-000001';
        }

        // Incrementar el número
        const nextNumber = parseInt(numberPart, 10) + 1;

        // Formatear con padding de 6 dígitos
        const paddedNumber = nextNumber.toString().padStart(6, '0');

        return `S-${paddedNumber}`;
    }
}
