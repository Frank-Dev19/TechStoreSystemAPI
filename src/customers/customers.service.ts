import {  
  ConflictException, 
  Injectable, 
  NotFoundException, 
  BadRequestException 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

type FindAllQuery = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: string;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(DocumentType)
    private readonly documentTypeRepository: Repository<DocumentType>,
  ) {}

  private validateDocumentLength(documentTypeName: string, documentNumber: string) {
    if (documentTypeName === 'RUC' && documentNumber.length !== 11) {
      throw new BadRequestException('RUC must be 11 digits');
    }
    if (documentTypeName === 'DNI' && documentNumber.length !== 8) {
      throw new BadRequestException('DNI must be 8 digits');
    }
  }

  async create(createCustomerDto: CreateCustomerDto) {
    const dt = await this.documentTypeRepository.findOne({ where: { id: Number(createCustomerDto.documentTypeId) } });
    if (!dt) throw new BadRequestException('Invalid document type');
    this.validateDocumentLength(dt.name, createCustomerDto.documentNumber);
    
    const exists = await this.customerRepository.findOne({
      where: { documentNumber: createCustomerDto.documentNumber },
      select: ['id'],
    });
    if (exists) throw new ConflictException('Document number already exists');
    
    const entity = this.customerRepository.create(createCustomerDto);
    return this.customerRepository.save(entity);
  }

  async findAll(query: FindAllQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const where: any[] = [];
    
    if (query.search) {
      const q = query.search.trim();
      where.push(
        { name: ILike(`%${q}%`) },
        { documentNumber: ILike(`%${q}%`) },
        { email: ILike(`%${q}%`) },
        { phone: ILike(`%${q}%`) },
      );
    }

    const [data, total] = await this.customerRepository.findAndCount({
      where: where.length ? where : undefined,
      order: { name: 'ASC' },
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
    const c = await this.customerRepository.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Customer with id ${id} not found`);
    return c;
  }

  async update(id: number, updateCustomerDto: UpdateCustomerDto) {
    const c = await this.findOne(id);

    if (updateCustomerDto.documentTypeId || updateCustomerDto.documentNumber) {
      const documentTypeId = updateCustomerDto.documentTypeId
        ? Number(updateCustomerDto.documentTypeId)
        : c.documentTypeId;
      const dt = await this.documentTypeRepository.findOne({ where: { id: documentTypeId } });
      if (!dt) throw new BadRequestException('Invalid document type');

      const documentNumber = updateCustomerDto.documentNumber ?? c.documentNumber;
      this.validateDocumentLength(dt.name, documentNumber);
      
      if (updateCustomerDto.documentNumber && updateCustomerDto.documentNumber !== c.documentNumber) {
        const exists = await this.customerRepository.findOne({
          where: { documentNumber: updateCustomerDto.documentNumber },
          select: ['id'],
        });
        if (exists) throw new ConflictException('Document number already exists');
      }
    }

    Object.assign(c, updateCustomerDto);
    return this.customerRepository.save(c);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.customerRepository.softDelete(id);
    return { ok: true};
  }

  async restore(id: number) {
    const c = await this.customerRepository.findOne({ where: { id }, withDeleted: true });
    if (!c) throw new NotFoundException(`Customer with id ${id} not found`);
    if (!c.deletedAt) return { ok: true};
    await this.customerRepository.restore(id);
    return { ok: true};
  }

  async hardRemove(id: number) {
    const c = await this.customerRepository.findOne({ where: { id }, withDeleted: true });
    if (!c) throw new NotFoundException(`Customer with id ${id} not found`);
    await this.customerRepository.remove(c);
    return { ok: true};
  }
}
