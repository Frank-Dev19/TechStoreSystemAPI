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
import { Client } from './entities/client.entity';
import { CreateClientDto } from './create-client.dto';
import { UpdateClientDto } from './update-client.dto';

type FindAllQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  companyId?: number | string;
  documentNumber?: string;
};

@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
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

  async create(createClientDto: CreateClientDto) {
    const companyId = Number(createClientDto.companyId);
    if (!companyId || Number.isNaN(companyId)) {
      throw new BadRequestException('companyId is required to create a client');
    }

    await this.validateDocumentLength(createClientDto.documentTypeId, createClientDto.documentNumber);

    const exists = await this.clientRepository.findOne({
      where: {
        companyId,
        documentTypeId: createClientDto.documentTypeId,
        documentNumber: createClientDto.documentNumber,
      },
      withDeleted: true,
      select: ['id', 'deletedAt', 'name'],
    });

    if (exists) {
      if (exists.deletedAt) {
        throw new HttpException(
          {
            statusCode: HttpStatus.CONFLICT,
            message: 'Client exists but is deleted',
            error: 'Conflict',
            deleted: true,
            data: exists,
          },
          HttpStatus.CONFLICT,
        );
      }
      throw new ConflictException('Client already exists');
    }

    const entity = this.clientRepository.create({
      ...createClientDto,
      companyId,
    });

    return this.clientRepository.save(entity);
  }

  async findAll(query: FindAllQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const companyId = Number(query.companyId);
    if (!query.companyId || Number.isNaN(companyId) || companyId <= 0) {
      throw new BadRequestException('Valid companyId is required to list clients');
    }

    const normalizedStatus = (query.status ?? 'active').toString().toLowerCase();
    const showDeleted = normalizedStatus === 'deleted' || normalizedStatus === 'eliminados';
    const deletedCondition = showDeleted ? Not(IsNull()) : IsNull();

    const baseCondition: Pick<FindOptionsWhere<Client>, 'companyId' | 'deletedAt'> = {
      companyId,
      deletedAt: deletedCondition,
    };

    const where: FindOptionsWhere<Client>[] = [];
    const buildCondition = (condition: FindOptionsWhere<Client>): FindOptionsWhere<Client> => ({
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

    const [data, total] = await this.clientRepository.findAndCount({
      where: where.length ? where : { companyId },
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
      withDeleted: showDeleted,
    });

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Client with id ${id} not found`);
    return client;
  }

  async update(id: number, updateClientDto: UpdateClientDto) {
    const client = await this.findOne(id);

    if (updateClientDto.documentTypeId || updateClientDto.documentNumber) {
      const documentTypeId = updateClientDto.documentTypeId
        ? Number(updateClientDto.documentTypeId)
        : client.documentTypeId;
      const dt = await this.documentTypeRepository.findOne({ where: { id: documentTypeId } });
      if (!dt) throw new BadRequestException('Invalid document type');

      const documentNumber = updateClientDto.documentNumber ?? client.documentNumber;
      await this.validateDocumentLength(dt.id, documentNumber);

      const duplicate = await this.clientRepository.findOne({
        where: {
          companyId: client.companyId,
          documentTypeId,
          documentNumber,
          id: Not(client.id),
        },
        withDeleted: true,
        select: ['id', 'deletedAt', 'name'],
      });

      if (duplicate) {
        if (duplicate.deletedAt) {
          throw new HttpException(
            {
              statusCode: HttpStatus.CONFLICT,
              message: 'Client exists but is deleted',
              error: 'Conflict',
              deleted: true,
              data: duplicate,
            },
            HttpStatus.CONFLICT,
          );
        }
        throw new ConflictException('Client already exists');
      }
    }

    Object.assign(client, updateClientDto);
    return this.clientRepository.save(client);
  }

  async softDelete(id: number) {
    await this.findOne(id);
    await this.clientRepository.softDelete(id);
    return { ok: true, message: `Client with id: ${id} deleted successfully` };
  }

  async bulkSoftDelete(ids: number[]) {
    if (!ids?.length) throw new BadRequestException('No ids provided');
    const count = await this.clientRepository.count({ where: { id: In(ids) } });
    if (!count) throw new NotFoundException(`Clients with ids ${ids.join(', ')} not found`);
    await this.clientRepository.softDelete(ids);
    return { ok: true, message: `${count} clients deleted successfully` };
  }

  async restore(id: number) {
    const client = await this.clientRepository.findOne({ where: { id }, withDeleted: true });
    if (!client) throw new NotFoundException(`Client with id ${id} not found`);
    if (!client.deletedAt) {
      return { ok: true, message: 'Client was already restored' };
    }
    client.deletedAt = null;
    return this.clientRepository.save(client);
  }

  async bulkRestore(ids: number[]) {
    if (!ids?.length) throw new BadRequestException('No ids provided');
    const count = await this.clientRepository.count({ where: { id: In(ids) }, withDeleted: true });
    if (!count) throw new NotFoundException(`Clients with ids ${ids.join(', ')} not found`);

    for (const id of ids) {
      const client = await this.clientRepository.findOne({ where: { id }, withDeleted: true });
      if (!client) throw new NotFoundException(`Client with id ${id} not found`);
      if (!client.deletedAt) return { ok: true, message: 'Client was already restored' };
      client.deletedAt = null;
      await this.clientRepository.save(client);
    }

    return { ok: true, message: `${count} clients restored successfully` };
  }
}
