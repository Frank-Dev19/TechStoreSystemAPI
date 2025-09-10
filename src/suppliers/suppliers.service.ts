import { 
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm'
import { Supplier, DocumentType} from './entities/supplier.entity'
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

type FindAllQuery = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: string;
}

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>
  ) {}

  private validateDocumentLength(documentType: DocumentType, documentNumber: string) {
    if (documentType === DocumentType.RUC && documentNumber.length !== 11) {
      throw new BadRequestException('RUC must be 11 digits');
    }
    if (documentType === DocumentType.DNI && documentNumber.length !== 8) {
      throw new BadRequestException('DNI must be 8 digits');
    }
  }

  async create(createSupplierDto: CreateSupplierDto) {
    this.validateDocumentLength(createSupplierDto.documentType, createSupplierDto.documentNumber);
    
    const exists = await this.supplierRepository.findOne({
      where: { documentNumber: createSupplierDto.documentNumber },
      select: ['id'],
    });

    if (exists) throw new ConflictException('Document number already exists');

    const entity = this.supplierRepository.create(createSupplierDto);
    return this.supplierRepository.save(entity);
  }

  async findAll(query: FindAllQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const where: any[] = [];

    if (query.search) {
      const q = query.search.trim();
      where.push(
        { businessName: ILike(`%${q}%`) },
        { tradeName: ILike(`%${q}%`) },
        { documentNumber: ILike(`%${q}%`) },
        { email: ILike(`%${q}%`) },
        { phone: ILike(`%${q}%`) },
      );
    }

    const [data, total] = await this.supplierRepository.findAndCount({
      where: where.length ? where : undefined,
      order: { businessName: 'ASC'},
      skip: (page - 1) * limit,
      take: limit,
    });

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
    const s = await this.supplierRepository.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Supplier with id ${id} not found`);
    return s;
  }

  async update(id: number, updateSupplierDto: UpdateSupplierDto) {
    const s = await this.findOne(id);

    if (updateSupplierDto.documentType || updateSupplierDto.documentNumber) {
      const documentType = updateSupplierDto.documentType ?? s.documentType;
      const documentNumber = updateSupplierDto.documentNumber ?? s.documentNumber;
      this.validateDocumentLength(documentType, documentNumber);

      if (updateSupplierDto.documentNumber && updateSupplierDto.documentNumber !== s.documentNumber) {
        const exists = await this.supplierRepository.findOne({
          where: { documentNumber: updateSupplierDto.documentNumber },
          select: ['id'],
        });  
        if (exists) throw new ConflictException('Document number already exists');
      }
    }
    
    Object.assign(s, updateSupplierDto);
    return this.supplierRepository.save(s);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.supplierRepository.softDelete(id);
    return { ok: true};
  }

  async restore(id: number) {
    const s = await this.supplierRepository.findOne({ where: { id }, withDeleted: true });
    if (!s) throw new NotFoundException(`Supplier with id ${id} not found`);
    if (!s.deletedAt) return { ok: true};
    await this.supplierRepository.restore(id);
    return { ok: true};
  }

  async hardRemove(id: number) {
    const s = await this.supplierRepository.findOne({ where: { id }, withDeleted: true });
    if (!s) throw new NotFoundException(`Supplier with id ${id} not found`);
    await this.supplierRepository.remove(s);
    return { ok: true};
  }
}
