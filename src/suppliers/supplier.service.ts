import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, In, IsNull, Not, Repository } from 'typeorm';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';
import {
  ensureBulkSoftDeleteTargets,
  findBulkRestoreTargetsOrThrow,
  findRestoreTargetOrThrow,
} from 'src/common/utils/soft-delete-restore.util';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto } from './create-supplier.dto';
import { UpdateSupplierDto } from './update-supplier.dto';

type FindAllQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  companyId?: number | string;
  documentNumber?: string;
};

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(DocumentType)
    private readonly documentTypeRepository: Repository<DocumentType>,
  ) {}

  private async validateDocumentLength(documentTypeId: number, documentNumber: string) {
    const dt = await this.documentTypeRepository.findOne({ where: { id: documentTypeId } });
    if (!dt) throw new BadRequestException('Invalid document type');
    if (documentNumber.length !== dt.digits) {
      throw new BadRequestException(`Document number must be ${dt.digits} digits`);
    }
  }

  private async ensureRestoreConflictFree(supplier: Supplier) {
    const duplicate = await this.supplierRepository.findOne({
      where: {
        companyId: supplier.companyId,
        documentTypeId: supplier.documentTypeId,
        documentNumber: supplier.documentNumber,
        id: Not(supplier.id),
      },
      select: ['id'],
    });

    if (duplicate) {
      throw new ConflictException('Supplier already exists');
    }
  }

  async create(createSupplierDto: CreateSupplierDto) {
    const companyId = Number(createSupplierDto.companyId);
    if (!companyId || Number.isNaN(companyId)) {
      throw new BadRequestException('companyId is required to create a supplier');
    }

    await this.validateDocumentLength(createSupplierDto.documentTypeId, createSupplierDto.documentNumber);

    const exists = await this.supplierRepository.findOne({
      where: {
        companyId,
        documentTypeId: createSupplierDto.documentTypeId,
        documentNumber: createSupplierDto.documentNumber,
      },
      withDeleted: true,
      select: ['id', 'deletedAt', 'name'],
    });

    if (exists) {
      if (exists.deletedAt) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            message: 'Supplier exists but is deleted',
            error: 'Conflict',
            deleted: true,
            data: exists,
          },
          HttpStatus.CONFLICT,
        );
      }
      throw new ConflictException('Supplier already exists');
    }

    const entity = this.supplierRepository.create({
      ...createSupplierDto,
      companyId,
    });

    return this.supplierRepository.save(entity);
  }

  async findAll(query: FindAllQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const companyId = Number(query.companyId);
    if (!query.companyId || Number.isNaN(companyId) || companyId <= 0) {
      throw new BadRequestException('Valid companyId is required to list suppliers');
    }

    const normalizedStatus = (query.status ?? 'active').toString().toLowerCase();
    const showDeleted = normalizedStatus === 'deleted' || normalizedStatus === 'eliminados';
    const deletedCondition = showDeleted ? Not(IsNull()) : IsNull();

    const baseCondition: Pick<FindOptionsWhere<Supplier>, 'companyId' | 'deletedAt'> = {
      companyId,
      deletedAt: deletedCondition,
    };

    const where: FindOptionsWhere<Supplier>[] = [];
    const buildCondition = (condition: FindOptionsWhere<Supplier>): FindOptionsWhere<Supplier> => ({
      ...condition,
      companyId: baseCondition.companyId,
      deletedAt: baseCondition.deletedAt,
    });

    const searchTerm = query.search?.trim();
    if (query.documentNumber !== undefined) {
      const documentNumber = String(query.documentNumber).trim();
      if (documentNumber) {
        where.push(buildCondition({ documentNumber }));
      }
    }

    if (searchTerm) {
      const q = searchTerm;
      where.push(
        buildCondition({ name: ILike(`%${q}%`) }),
        buildCondition({ tradeName: ILike(`%${q}%`) }),
        buildCondition({ documentType: { name: ILike(`%${q}%`) } }),
        buildCondition({ email: ILike(`%${q}%`) }),
        buildCondition({ phone: ILike(`%${q}%`) }),
        buildCondition({ address: ILike(`%${q}%`) }),
        buildCondition({ city: ILike(`%${q}%`) }),
        buildCondition({ country: ILike(`%${q}%`) }),
      );
    } else {
      where.push(baseCondition);
    }

    const [data, total] = await this.supplierRepository.findAndCount({
      where: where.length ? where : { companyId },
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
      withDeleted: showDeleted,
    });

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) throw new NotFoundException(`Supplier with id ${id} not found`);
    return supplier;
  }

  async update(id: number, updateSupplierDto: UpdateSupplierDto) {
    const supplier = await this.findOne(id);

    if (updateSupplierDto.documentTypeId || updateSupplierDto.documentNumber) {
      const documentTypeId = updateSupplierDto.documentTypeId
        ? Number(updateSupplierDto.documentTypeId)
        : supplier.documentTypeId;
      const dt = await this.documentTypeRepository.findOne({ where: { id: documentTypeId } });
      if (!dt) throw new BadRequestException('Invalid document type');

      const documentNumber = updateSupplierDto.documentNumber ?? supplier.documentNumber;
      await this.validateDocumentLength(dt.id, documentNumber);

      const duplicate = await this.supplierRepository.findOne({
        where: {
          companyId: supplier.companyId,
          documentTypeId,
          documentNumber,
          id: Not(supplier.id),
        },
        withDeleted: true,
        select: ['id', 'deletedAt', 'name'],
      });

      if (duplicate) {
        if (duplicate.deletedAt) {
          throw new HttpException(
            {
              statusCode: HttpStatus.CONFLICT,
              message: 'Supplier exists but is deleted',
              error: 'Conflict',
              deleted: true,
              data: duplicate,
            },
            HttpStatus.CONFLICT,
          );
        }
        throw new ConflictException('Supplier already exists');
      }
    }

    Object.assign(supplier, updateSupplierDto);
    return this.supplierRepository.save(supplier);
  }

  async softDelete(id: number) {
    await this.findOne(id);
    await this.supplierRepository.softDelete(id);
    return { ok: true, message: `Supplier with id: ${id} deleted successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    const count = await ensureBulkSoftDeleteTargets(this.supplierRepository, ids, (targetIds) =>
      `Suppliers with ids ${targetIds.join(', ')} not found`,
    );
    await this.supplierRepository.softDelete(ids);
    return { ok: true, message: `${count} suppliers deleted successfully` };
  }

  async restore(id: number) {
    const supplier = await findRestoreTargetOrThrow(
      this.supplierRepository,
      id,
      `Supplier with id ${id} not found`,
    );
    if (!supplier.deletedAt) {
      return { ok: true, message: 'Supplier was already restored' };
    }
    await this.ensureRestoreConflictFree(supplier);
    supplier.deletedAt = null;
    return this.supplierRepository.save(supplier);
  }

  async bulkRestore(ids: number[]) {
    const targets = await findBulkRestoreTargetsOrThrow(
      this.supplierRepository,
      ids,
      (targetIds) => `Suppliers with ids ${targetIds.join(', ')} not found`,
      (targetId) => `Supplier with id ${targetId} not found`,
    );

    for (const supplier of targets) {
      if (!supplier.deletedAt) return { ok: true, message: 'Supplier was already restored' };
      await this.ensureRestoreConflictFree(supplier);
      supplier.deletedAt = null;
      await this.supplierRepository.save(supplier);
    }

    return { ok: true, message: `${targets.length} suppliers restored successfully` };
  }
}
