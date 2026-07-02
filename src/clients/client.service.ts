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
import { CommitClientImportDto } from './dto/commit-client-import.dto';
import { ImportClientRowDto } from './dto/import-client-row.dto';
import { ValidateClientImportDto } from './dto/validate-client-import.dto';
import { UpdateClientDto } from './update-client.dto';

type FindAllQuery = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  companyId?: number | string;
  documentNumber?: string;
  documentTypeId?: number | string;
};

type ImportValidationStatus = 'ready' | 'error' | 'duplicate';

type NormalizedImportRow = {
  rowNumber: number;
  documentTypeId?: number;
  documentNumber?: string;
  name?: string;
  tradeName?: string;
  phone?: string;
  address?: string;
  ubigeo?: string;
  department?: string;
  province?: string;
  district?: string;
  urbanization?: string;
  countryCode?: string;
  city?: string;
  country?: string;
};

type ValidatedImportRow = NormalizedImportRow & {
  status: ImportValidationStatus;
  errors: string[];
  duplicateExistingClientId?: number;
};

@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(DocumentType)
    private readonly documentTypeRepository: Repository<DocumentType>,
  ) {}

  private normalizeOptionalText(value: unknown): string | undefined {
    const normalized = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized ? normalized : undefined;
  }

  private normalizeDocumentNumber(value: unknown): string | undefined {
    const normalized = String(value ?? '')
      .replace(/\s+/g, '')
      .trim();
    return normalized ? normalized : undefined;
  }

  private stripUiOnlyFields<T extends CreateClientDto | UpdateClientDto>(dto: T): Partial<Client> {
    const { kind, contacts, isClient, isSupplier, ...clientFields } = dto as any;
    return clientFields;
  }

  private toResponse(client: Client) {
    return {
      ...client,
      kind: client.documentType?.kind ?? undefined,
      contacts: [],
    };
  }

  private normalizeImportRow(row: ImportClientRowDto): NormalizedImportRow {
    return {
      rowNumber: Number(row.rowNumber),
      documentTypeId: row.documentTypeId ? Number(row.documentTypeId) : undefined,
      documentNumber: this.normalizeDocumentNumber(row.documentNumber),
      name: this.normalizeOptionalText(row.name),
      tradeName: this.normalizeOptionalText(row.tradeName),
      phone: this.normalizeOptionalText(row.phone),
      address: this.normalizeOptionalText(row.address),
      ubigeo: this.normalizeDocumentNumber(row.ubigeo),
      department: this.normalizeOptionalText(row.department),
      province: this.normalizeOptionalText(row.province),
      district: this.normalizeOptionalText(row.district),
      urbanization: this.normalizeOptionalText(row.urbanization),
      countryCode: this.normalizeOptionalText(row.countryCode)?.toUpperCase(),
      city: this.normalizeOptionalText(row.city),
      country: this.normalizeOptionalText(row.country),
    };
  }

  private async buildExistingClientsMap(
    companyId: number,
    rows: NormalizedImportRow[],
  ): Promise<Map<string, Client>> {
    const candidateKeys = rows
      .filter((row) => row.documentTypeId && row.documentNumber)
      .map((row) => ({
        companyId,
        documentTypeId: Number(row.documentTypeId),
        documentNumber: String(row.documentNumber),
      }));

    if (!candidateKeys.length) {
      return new Map();
    }

    const existingClients = await this.clientRepository.find({
      where: candidateKeys,
      withDeleted: false,
      select: ['id', 'companyId', 'documentTypeId', 'documentNumber', 'name'],
    });

    return new Map(
      existingClients.map((client) => [
        `${client.companyId}:${client.documentTypeId}:${client.documentNumber}`,
        client,
      ]),
    );
  }

  private async validateImportRows(
    companyId: number,
    rows: ImportClientRowDto[],
  ): Promise<ValidatedImportRow[]> {
    const normalizedRows = rows.map((row) => this.normalizeImportRow(row));
    const documentTypeIds = Array.from(
      new Set(normalizedRows.map((row) => Number(row.documentTypeId)).filter((value) => value > 0)),
    );

    const documentTypes = documentTypeIds.length
      ? await this.documentTypeRepository.find({ where: { id: In(documentTypeIds) } })
      : [];

    const documentTypesById = new Map(documentTypes.map((docType) => [Number(docType.id), docType]));
    const existingClientsByKey = await this.buildExistingClientsMap(companyId, normalizedRows);

    return normalizedRows.map((row) => {
      const errors: string[] = [];
      const docTypeId = row.documentTypeId ? Number(row.documentTypeId) : undefined;
      const docType = docTypeId ? documentTypesById.get(docTypeId) : undefined;

      if (!docTypeId) {
        errors.push('Selecciona un tipo de documento.');
      } else if (!docType) {
        errors.push('El tipo de documento no existe.');
      }

      if (!row.documentNumber) {
        errors.push('Completa el número de documento.');
      } else if (!/^\d+$/.test(row.documentNumber)) {
        errors.push('El documento solo puede contener dígitos.');
      } else if (docType && row.documentNumber.length !== Number(docType.digits)) {
        errors.push(`El documento debe tener ${docType.digits} dígitos.`);
      }

      if (!row.name) {
        errors.push('Completa la razón social o nombre del cliente.');
      }

      if (row.ubigeo && !/^\d{6}$/.test(row.ubigeo)) {
        errors.push('El ubigeo debe tener 6 dígitos.');
      }

      if (row.countryCode && !/^[A-Z]{2}$/.test(row.countryCode)) {
        errors.push('El código de país debe tener 2 letras.');
      }

      const duplicateKey =
        docTypeId && row.documentNumber
          ? `${companyId}:${docTypeId}:${row.documentNumber}`
          : undefined;
      const duplicateExistingClient = duplicateKey ? existingClientsByKey.get(duplicateKey) : undefined;

      if (duplicateExistingClient) {
        errors.push('Ya existe un cliente con ese documento en la base de datos.');
      }

      return {
        ...row,
        status: duplicateExistingClient
          ? 'duplicate'
          : errors.length
            ? 'error'
            : 'ready',
        errors,
        duplicateExistingClientId: duplicateExistingClient?.id,
      };
    });
  }

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
      ...this.stripUiOnlyFields(createClientDto),
      companyId,
    });

    const saved = await this.clientRepository.save(entity);
    return this.findOne(saved.id);
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
    const documentTypeId = query.documentTypeId != null ? Number(query.documentTypeId) : undefined;

    const baseCondition: Pick<FindOptionsWhere<Client>, 'companyId' | 'deletedAt'> = {
      companyId,
      deletedAt: deletedCondition,
    };

    const where: FindOptionsWhere<Client>[] = [];
    const buildCondition = (condition: FindOptionsWhere<Client>): FindOptionsWhere<Client> => ({
      ...condition,
      companyId: baseCondition.companyId,
      deletedAt: baseCondition.deletedAt,
      ...(documentTypeId && !Number.isNaN(documentTypeId) ? { documentTypeId } : {}),
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
        buildCondition({ documentNumber: ILike(`%${q}%`) }),
        buildCondition({ documentType: { name: ILike(`%${q}%`) } }),
        buildCondition({ email: ILike(`%${q}%`) }),
        buildCondition({ phone: ILike(`%${q}%`) }),
        buildCondition({ address: ILike(`%${q}%`) }),
        buildCondition({ city: ILike(`%${q}%`) }),
        buildCondition({ country: ILike(`%${q}%`) }),
      );
    } else if (!where.length) {
      where.push({
        ...baseCondition,
        ...(documentTypeId && !Number.isNaN(documentTypeId) ? { documentTypeId } : {}),
      });
    }

    const [data, total] = await this.clientRepository.findAndCount({
      where: where.length ? where : { companyId },
      relations: {
        documentType: true,
      },
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
      withDeleted: showDeleted,
    });

    return { data: data.map((client) => this.toResponse(client)), total, page, limit };
  }

  async findOne(id: number) {
    const client = await this.clientRepository.findOne({
      where: { id },
      relations: {
        documentType: true,
      },
    });
    if (!client) throw new NotFoundException(`Client with id ${id} not found`);
    return this.toResponse(client);
  }

  async update(id: number, updateClientDto: UpdateClientDto) {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Client with id ${id} not found`);

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

    Object.assign(client, this.stripUiOnlyFields(updateClientDto));
    await this.clientRepository.save(client);
    return this.findOne(id);
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

  async validateImport(dto: ValidateClientImportDto) {
    const companyId = Number(dto.companyId);
    if (!companyId || Number.isNaN(companyId)) {
      throw new BadRequestException('Valid companyId is required to validate import rows');
    }

    const rows = await this.validateImportRows(companyId, dto.rows ?? []);
    const summary = {
      totalRows: rows.length,
      readyRows: rows.filter((row) => row.status === 'ready').length,
      duplicateRows: rows.filter((row) => row.status === 'duplicate').length,
      errorRows: rows.filter((row) => row.status === 'error').length,
    };

    return { rows, summary };
  }

  async commitImport(dto: CommitClientImportDto) {
    const companyId = Number(dto.companyId);
    if (!companyId || Number.isNaN(companyId)) {
      throw new BadRequestException('Valid companyId is required to import clients');
    }

    const validatedRows = await this.validateImportRows(companyId, dto.rows ?? []);
    const readyRows = validatedRows.filter((row) => row.status === 'ready');
    const skippedRows = validatedRows.filter((row) => row.status !== 'ready');
    const createdClients: Client[] = [];
    const failedRows: Array<ValidatedImportRow & { errorMessage?: string }> = [];

    if (readyRows.length) {
      const entities = readyRows.map((row) =>
        this.clientRepository.create({
          companyId,
          name: row.name!,
          tradeName: row.tradeName,
          documentTypeId: Number(row.documentTypeId),
          documentNumber: row.documentNumber!,
          phone: row.phone,
          address: row.address,
          ubigeo: row.ubigeo,
          department: row.department,
          province: row.province,
          district: row.district,
          urbanization: row.urbanization,
          countryCode: row.countryCode,
          city: row.city,
          country: row.country,
        }),
      );

      try {
        const saved = await this.clientRepository.save(entities, { chunk: 200 });
        createdClients.push(...saved);
      } catch (error) {
        for (const entity of entities) {
          try {
            const savedEntity = await this.clientRepository.save(entity);
            createdClients.push(savedEntity);
          } catch (saveError) {
            failedRows.push({
              rowNumber: 0,
              documentTypeId: entity.documentTypeId,
              documentNumber: entity.documentNumber,
              name: entity.name,
              tradeName: entity.tradeName,
              phone: entity.phone,
              address: entity.address,
              ubigeo: entity.ubigeo ?? undefined,
              department: entity.department ?? undefined,
              province: entity.province ?? undefined,
              district: entity.district ?? undefined,
              urbanization: entity.urbanization ?? undefined,
              countryCode: entity.countryCode ?? undefined,
              city: entity.city,
              country: entity.country,
              status: 'error',
              errors: ['No se pudo importar la fila en el commit final.'],
              errorMessage:
                saveError instanceof Error ? saveError.message : 'Unknown error while importing row',
            });
          }
        }
      }
    }

    return {
      createdCount: createdClients.length,
      skippedCount: skippedRows.length + failedRows.length,
      summary: {
        totalRows: dto.rows.length,
        createdRows: createdClients.length,
        skippedRows: skippedRows.length,
        failedRows: failedRows.length,
      },
      skippedRows,
      failedRows,
    };
  }
}
