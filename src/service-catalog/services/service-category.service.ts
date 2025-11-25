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
import { ServiceCategory } from "../entities/service-category.entity";
import { CreateServiceCategoryDto } from "../dto/create-service-category.dto";
import { UpdateServiceCategoryDto } from "../dto/update-service-category.dto";

type FindAllQuery = {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: string;
    withDeleted?: string;
}

@Injectable()
export class ServiceCategoryService {
    constructor(
        @InjectRepository(ServiceCategory)
        private readonly serviceCategoryRepository: Repository<ServiceCategory>,
    ) {}

    /**
     * Crea una nueva categoría de servicio con código auto-generado
     * Implementa retry logic para manejar race conditions
     */
    async create(createServiceCategoryDto: CreateServiceCategoryDto): Promise<ServiceCategory> {
        // Validar que el nombre no esté vacío
        const maxRetries = 3;
        let lastError: any;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Generar código automáticamente
                const code = await this.generateNextCode();

                // Verificar si ya existe una categoría con el mismo nombre
                const exists = await this.serviceCategoryRepository.findOne({
                    where: { name: createServiceCategoryDto.name },
                    withDeleted: true,
                    select: ['id', 'deletedAt', 'name', 'code'],
                });

                if (exists) {
                    if (exists.deletedAt) {
                        throw new HttpException(
                            {
                                statusCode: HttpStatus.CONFLICT,
                                message: 'Category with this name already exists but is deleted',
                                error: 'Conflict',
                                deleted: true,
                                data: exists,
                            },
                            HttpStatus.CONFLICT,
                        );
                    }
                    throw new ConflictException('Category with this name already exists');
                }

                const category = this.serviceCategoryRepository.create({
                    ...createServiceCategoryDto,
                    code,
                });

                return await this.serviceCategoryRepository.save(category);

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
     * Obtiene todas las categorías de servicio con paginación
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
            baseCondition.isActive = query.isActive === 'true';
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

        const [data, total] = await this.serviceCategoryRepository.findAndCount({
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
     * Obtiene una categoría por ID
     */
    async findOne(id: number): Promise<ServiceCategory> {
        const category = await this.serviceCategoryRepository.findOne({
            where: { id },
        });

        if (!category) throw new NotFoundException(`Category with id ${id} not found`);

        return category;
    }

    /**
     * Actualiza una categoría de servicio
     */
    async update(id: number, dto: UpdateServiceCategoryDto): Promise<ServiceCategory> {
        const category = await this.findOne(id);

        // Si se está actualizando el nombre, verificar que no exista otra categoría con ese nombre
        if (dto.name && dto.name !== category.name) {
            const duplicate = await this.serviceCategoryRepository.findOne({
                where: {
                    name: dto.name,
                    id: Not(id),
                },
                withDeleted: true,
                select: ['id', 'deletedAt', 'name', 'code'],
            });

            if (duplicate) {
                if (duplicate.deletedAt) {
                    throw new HttpException(
                        {
                            statusCode: HttpStatus.CONFLICT,
                            message: 'Category with this name already exists but is deleted',
                            error: 'Conflict',
                            deleted: true,
                            data: duplicate,
                        },
                        HttpStatus.CONFLICT,
                    );
                }
                throw new ConflictException('Category with this name already exists');
            }
        }

        Object.assign(category, dto);

        return await this.serviceCategoryRepository.save(category);
    }

    /**
     * Soft delete de una categoría
     */
    async softDelete(id: number) {
        await this.findOne(id);
        await this.serviceCategoryRepository.softDelete(id);
        return { ok: true, message: `Category with id ${id} deleted successfully` };
    }

    /**
     * Restaura una categoría soft-deleted
     */
    async restore(id: number) {
        const category = await this.serviceCategoryRepository.findOne({
            where: { id },
            withDeleted: true
        });

        if (!category) {
            throw new NotFoundException(`Category with id ${id} not found`);
        }

        if (!category.deletedAt) {
            return { ok: true, message: 'Category already active' };
        }

        category.deletedAt = null;
        await this.serviceCategoryRepository.save(category);

        return { ok: true, message: `Category with id ${id} restored successfully` };
    }

    /**
     * Elimina múltiples categorías (soft delete)
     */
    async bulkSoftDelete(ids: number[]) {
        if (!ids?.length) {
            throw new BadRequestException('No ids provided');
        }

        const count = await this.serviceCategoryRepository.count({ where: { id: In(ids) } });
        if (!count) {
            throw new NotFoundException(`Categories with ids ${ids.join(', ')} not found`);
        }

        await this.serviceCategoryRepository.softDelete(ids);

        return { ok: true, message: `${count} categories deleted successfully` };
    }

    /**
     * Restaura múltiples categorías soft-deleted
     */
    async bulkRestore(ids: number[]) {
        if (!ids?.length) {
            throw new BadRequestException('No ids provided');
        }

        const count = await this.serviceCategoryRepository.count({
            where: { id: In(ids) },
            withDeleted: true
        });

        if (!count) {
            throw new NotFoundException(`Categories with ids ${ids.join(', ')} not found`);
        }

        for (const id of ids) {
            const category = await this.serviceCategoryRepository.findOne({
                where: { id },
                withDeleted: true
            });

            if (!category) {
                throw new NotFoundException(`Category with id ${id} not found`);
            }

            if (!category.deletedAt) {
                return { ok: true, message: 'Category already active' };
            }

            category.deletedAt = null;
            await this.serviceCategoryRepository.save(category);
        }

        return { ok: true, message: `${count} categories restored successfully` };
    }

    /**
     * Genera el siguiente código automático en formato "SC-XXXXXX"
     * @private
     */
    private async generateNextCode(): Promise<string> {
        // Buscar la última categoría con código que empiece con "SC-"
        const lastCategory = await this.serviceCategoryRepository
            .createQueryBuilder('category')
            .withDeleted()
            .where('category.code LIKE :pattern', { pattern: 'SC-%' })
            .orderBy('category.code', 'DESC')
            .limit(1)
            .getOne();

        if (!lastCategory) {
            // Primera categoría, empezar en SC-000001
            return 'SC-000001';
        }

        // Extraer el número del último código: "SC-000045" -> "000045"
        const lastCode = lastCategory.code;
        const numberPart = lastCode.split('-')[1];

        if (!numberPart || isNaN(parseInt(numberPart, 10))) {
            // Si el formato no es válido, empezar de nuevo
            return 'SC-000001';
        }

        // Incrementar el número
        const nextNumber = parseInt(numberPart, 10) + 1;

        // Formatear con padding de 6 dígitos
        const paddedNumber = nextNumber.toString().padStart(6, '0');

        return `SC-${paddedNumber}`;
    }
}
