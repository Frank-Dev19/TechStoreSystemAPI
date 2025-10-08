import { 
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DocumentType } from './entities/document-type.entity';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';

type FindAllQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

@Injectable()
export class DocumentTypesService {
  constructor(
    @InjectRepository(DocumentType)
    private readonly documentTypeRepository: Repository<DocumentType>,
  ) {}

  async create(createDocumentTypeDto: CreateDocumentTypeDto) {
    const existing = await this.documentTypeRepository.findOne({
      where: { name: createDocumentTypeDto.name },
      withDeleted: true,
    });
    if (existing) {
      if (existing.deletedAt) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            message: 'Document type exists but is deleted',
            error: 'Conflict',
            deleted: true,
            data: existing,
          },
          HttpStatus.CONFLICT,
        );
      }
      throw new ConflictException('Document type already exists');
    }
    const entity = this.documentTypeRepository.create(createDocumentTypeDto);
    return this.documentTypeRepository.save(entity);
  }

  async findAll(query: FindAllQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const normalizedStatus = (query.status ?? 'active').toString().toLowerCase();
    const showDeleted = normalizedStatus === 'deleted' || normalizedStatus === 'eliminados';
    const qb = this.documentTypeRepository
      .createQueryBuilder('documentType')
      .orderBy('documentType.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (showDeleted) {
      qb.withDeleted().where('documentType.deletedAt IS NOT NULL');
    } else {
      qb.where('documentType.deletedAt IS NULL');
    }

    if (query.search?.trim()) {
      qb.andWhere('documentType.name ILIKE :search', { search: `%${query.search.trim()}%` });
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: number) {
    const dt = await this.documentTypeRepository.findOne({ where: { id } });
    if (!dt) throw new NotFoundException(`Document type with id ${id} not found`);
    return dt;
  }

  async update(id: number, updateDocumentTypeDto: UpdateDocumentTypeDto) {
    const dt = await this.findOne(id);

    if (updateDocumentTypeDto.name && updateDocumentTypeDto.name !== dt.name) {
      const dup = await this.documentTypeRepository.findOne({
        where: { name: updateDocumentTypeDto.name },
        select: ['id'],
      });
      if (dup) throw new ConflictException('Document type name already exists');
    }

    Object.assign(dt, updateDocumentTypeDto);
    return this.documentTypeRepository.save(dt);
  }

  async softDelete(id: number) {
    await this.findOne(id);
    await this.documentTypeRepository.softDelete(id);
    return { ok: true, message: `Document type with id: ${id} deleted successfully`};
  }

  async bulkSoftDelete(ids: number[]) {
    if (!ids?.length) throw new BadRequestException('No ids provided');

    const count = await this.documentTypeRepository.count({ where: { id: In(ids) } });
    if (!count) throw new NotFoundException(`Document types with ids ${ids.join(', ')} not found`);
    await this.documentTypeRepository.softDelete(ids);
    return { ok: true, message: `${count} document types deleted successfully` };
  }

  async restore(id: number) {
    const dt = await this.documentTypeRepository.findOne({ where: { id }, withDeleted: true });
    if (!dt) throw new NotFoundException(`Document type with id ${id} not found`);
    if (!dt.deletedAt) return { ok: true, message: "Document type was already restored" };
    
    dt.deletedAt = null;
    await this.documentTypeRepository.save(dt);
    
    return { ok: true, message: `Document type with id: ${id} restored successfully` };
  }

  async bulkRestore(ids: number[]) {
    if (!ids?.length) throw new BadRequestException('No ids provided');

    const count = await this.documentTypeRepository.count({ where: { id: In(ids) }, withDeleted: true });
    if (!count) throw new NotFoundException(`Document types with ids ${ids.join(', ')} not found`);
    for (const id of ids) {
      const dt = await this.documentTypeRepository.findOne({ where: { id }, withDeleted: true });
      if (!dt) throw new NotFoundException(`Document type with id ${id} not found`);
      if (!dt.deletedAt) return { ok: true, message: "Document type was already restored" };
      
      dt.deletedAt = null;
      await this.documentTypeRepository.save(dt);
    }
    return { ok: true, message: `${count} document types restored successfully` };
  }
}
