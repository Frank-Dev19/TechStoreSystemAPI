import { 
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { DocumentType } from './entities/document-type.entity';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';

type FindAllQuery = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: string;
}

@Injectable()
export class DocumentTypesService {
  constructor(
    @InjectRepository(DocumentType)
    private readonly documentTypeRepository: Repository<DocumentType>,
  ) {}

  async create(createDocumentTypeDto: CreateDocumentTypeDto) {
    const exists = await this.documentTypeRepository.findOne({
      where: { name: createDocumentTypeDto.name },
      select: ['id'],
    });
    if (exists) throw new ConflictException('Document type already exists');
    const entity = this.documentTypeRepository.create(createDocumentTypeDto);
    return this.documentTypeRepository.save(entity);
  }

  async findAll(query: FindAllQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1,Number(query.limit) || 10));
    const where: any[] = [];

    if (query.search) {
      const q = query.search.trim();
      where.push(
        { name: ILike(`%${q}%`) },
      );
    }

    const [data, total] = await this.documentTypeRepository.findAndCount({
      where: where.length ? where : undefined,
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    })

    const isActive =
      query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;

    const filtered = isActive === undefined ? data : data.filter((d) => d.isActive === isActive);

    return {
      data: filtered,
      total: isActive === undefined ? total : filtered.length,
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

  async remove(id: number) {
    await this.findOne(id);
    await this.documentTypeRepository.softDelete(id);
    return { ok: true};
  }

  async restore(id: number) {
    const dt = await this.documentTypeRepository.findOne({ where: { id }, withDeleted: true });
    if (!dt) throw new NotFoundException(`Document type with id ${id} not found`);
    if (!dt.deletedAt) return { ok: true};
    await this.documentTypeRepository.restore(dt);
    return { ok: true};
  }

  async hardRemove(id: number) {
    const dt = await this.documentTypeRepository.findOne({ where: { id }, withDeleted: true });
    if (!dt) throw new NotFoundException(`Document type with id ${id} not found`);
    await this.documentTypeRepository.remove(dt);
    return { ok: true};
  }
}
