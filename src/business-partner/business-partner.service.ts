import { 
  ConflictException, 
  Injectable, 
  NotFoundException, 
  BadRequestException 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In, FindOptionsWhere } from 'typeorm';
import { BusinessPartner } from './entities/business-partner.entity';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';
import { CreateBusinessPartnerDto } from './dto/create-business-partner.dto';
import { UpdateBusinessPartnerDto } from './dto/update-business-partner.dto';

type FindAllQuery = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: string;
  companyId?: number | string;
}

@Injectable()
export class BusinessPartnerService {
  constructor(
    @InjectRepository(BusinessPartner)
    private readonly businessPartnerRepository: Repository<BusinessPartner>,
    @InjectRepository(DocumentType)
    private readonly documentTypeRepository: Repository<DocumentType>,
  ) {}

  private async validateDocumentLength(documentTypeId: number, documentNumber: string) {
    const dt = await this.documentTypeRepository.findOne({ where: { id: documentTypeId } });
    if (!dt) throw new BadRequestException('Invalid document type');
    if (documentNumber.length !== dt.digits) {
      throw new BadRequestException('Document number must be ' + dt.digits + ' digits');
    }
  }

  async create(createBusinessPartnerDto: CreateBusinessPartnerDto) {
    await this.validateDocumentLength(createBusinessPartnerDto.documentTypeId, createBusinessPartnerDto.documentNumber);
    
    const exists = await this.businessPartnerRepository.findOne({
      where: { documentNumber: createBusinessPartnerDto.documentNumber },
      select: ['id'],
    });
    if (exists) throw new ConflictException('Document number already exists');
    
    const entity = this.businessPartnerRepository.create(createBusinessPartnerDto);
    return this.businessPartnerRepository.save(entity);
  }

  async findAll(query: FindAllQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const companyId = Number(query.companyId);
    if (!query.companyId || Number.isNaN(companyId) || companyId <= 0) {
      throw new BadRequestException('Valid companyId is required to list business partners');
    }

    const where: FindOptionsWhere<BusinessPartner>[] = [];

    const searchTerm = query.search?.trim();
    if (searchTerm) {
      const q = searchTerm;
      where.push(
        { companyId, name: ILike(`%${q}%`) },
        { companyId, tradeName: ILike(`%${q}%`) },
        { companyId, documentType: { name: ILike(`%${q}%`) } },
        { companyId, documentNumber: ILike(`%${q}%`) },
        { companyId, email: ILike(`%${q}%`) },
        { companyId, phone: ILike(`%${q}%`) },
        { companyId, address: ILike(`%${q}%`) },
        { companyId, city: ILike(`%${q}%`) },
        { companyId, country: ILike(`%${q}%`) },
      );
    }
    
    const [data, total] = await this.businessPartnerRepository.findAndCount({
      where: where.length ? where : { companyId },
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    
    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: number) {
    const bp = await this.businessPartnerRepository.findOne({ where: { id } });
    if (!bp) throw new NotFoundException(`Business partner with id ${id} not found`);
    return bp;
  }

  async update(id: number, updateBusinessPartnerDto: UpdateBusinessPartnerDto) {
    const bp = await this.findOne(id);

    if (updateBusinessPartnerDto.documentTypeId || updateBusinessPartnerDto.documentNumber) {
      const documentTypeId = updateBusinessPartnerDto.documentTypeId
        ? Number(updateBusinessPartnerDto.documentTypeId)
        : bp.documentTypeId;
      const dt = await this.documentTypeRepository.findOne({ where: { id: documentTypeId } });
      if (!dt) throw new BadRequestException('Invalid document type');

      const documentNumber = updateBusinessPartnerDto.documentNumber ?? bp.documentNumber;
      this.validateDocumentLength(dt.id, documentNumber);
      
      if (updateBusinessPartnerDto.documentNumber && updateBusinessPartnerDto.documentNumber !== bp.documentNumber) {
        const exists = await this.businessPartnerRepository.findOne({
          where: { documentNumber: updateBusinessPartnerDto.documentNumber },
          select: ['id'],
        });
        if (exists) throw new ConflictException('Document number already exists');
      }
    }
    Object.assign(bp, updateBusinessPartnerDto);
    return this.businessPartnerRepository.save(bp);
  }

  async softDelete(id: number) {
    await this.findOne(id);
    await this.businessPartnerRepository.softDelete(id);
    return { ok: true, message: `Business partner with id: ${id} deleted successfully`};
  }

  async bulkSoftDelete(ids: number[]) {
    if (!ids?.length) throw new BadRequestException('No ids provided');

    const count = await this.businessPartnerRepository.count({ where: { id: In(ids) } });
    if (!count) throw new NotFoundException(`Business partners with ids ${ids.join(', ')} not found`);
    await this.businessPartnerRepository.softDelete(ids);
    return { ok: true, message: `${count} business partners deleted successfully` };
  }

  async restore(id: number) {
    const bp = await this.findOne(id);
    bp.deletedAt = null;
    return this.businessPartnerRepository.save(bp);
  }

  async bulkRestore(ids: number[]) {
    if (!ids?.length) throw new BadRequestException('No ids provided');
    
    const count = await this.businessPartnerRepository.count({ where: { id: In(ids) }, withDeleted: true });
    if (!count) throw new NotFoundException(`Business partners with ids ${ids.join(', ')} not found`);
    for (const id of ids) {
      const bp = await this.businessPartnerRepository.findOne({ where: { id }, withDeleted: true });
      if (!bp) throw new NotFoundException(`Business partner with id ${id} not found`);
      if (!bp.deletedAt) return { ok: true, message: "Business partner was already restored"};
      
      bp.deletedAt = null;
      await this.businessPartnerRepository.save(bp);
    }
    return { ok: true, message: `${count} business partners restored successfully` };
  }
}
