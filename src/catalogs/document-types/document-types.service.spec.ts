import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { DocumentTypesService } from './document-types.service';
import { DocumentType } from './entities/document-type.entity';
import { DocumentTypeKind } from './entities/document-type-kind.enum';

type MockRepo = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
  count: jest.Mock;
  softDelete: jest.Mock;
};

const createMockRepo = (): MockRepo => ({
  findOne: jest.fn(),
  create: jest.fn((value: DocumentType) => value),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
  count: jest.fn(),
  softDelete: jest.fn(),
});

describe('DocumentTypesService', () => {
  let service: DocumentTypesService;
  let repository: MockRepo;

  beforeEach(() => {
    repository = createMockRepo();
    service = new DocumentTypesService(repository as never);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('crea un document type con kind explícito', async () => {
    repository.findOne.mockResolvedValue(null);
    repository.save.mockImplementation((value: DocumentType) =>
      Promise.resolve({ ...value, id: 1 }),
    );

    const result = await service.create({
      name: 'RUC',
      digits: 11,
      description: 'Registro Único',
      kind: DocumentTypeKind.COMPANY,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: DocumentTypeKind.COMPANY }),
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: DocumentTypeKind.COMPANY }),
    );
    expect(result.kind).toBe(DocumentTypeKind.COMPANY);
  });

  it('actualiza kind de un document type existente', async () => {
    repository.findOne
      .mockResolvedValueOnce({
        id: 7,
        name: 'DNI',
        digits: 8,
        description: 'Documento nacional',
        kind: DocumentTypeKind.PERSON,
      })
      .mockResolvedValueOnce(null);
    repository.save.mockImplementation((value: DocumentType) =>
      Promise.resolve(value),
    );

    const result = await service.update(7, {
      kind: DocumentTypeKind.COMPANY,
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, kind: DocumentTypeKind.COMPANY }),
    );
    expect(result.kind).toBe(DocumentTypeKind.COMPANY);
  });

  it('expone kind al leer un document type', async () => {
    repository.findOne.mockResolvedValue({
      id: 2,
      name: 'RUC',
      digits: 11,
      description: 'Doc empresa',
      kind: DocumentTypeKind.COMPANY,
    });

    const result = await service.findOne(2);

    expect(result.kind).toBe(DocumentTypeKind.COMPANY);
  });

  it('mantiene el conflicto de create si el nombre ya existe activo', async () => {
    repository.findOne.mockResolvedValue({
      id: 4,
      name: 'DNI',
      deletedAt: null,
    });

    await expect(
      service.create({
        name: 'DNI',
        digits: 8,
        description: 'Doc natural',
        kind: DocumentTypeKind.PERSON,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('mantiene la sugerencia de restore si el nombre existe borrado', async () => {
    repository.findOne.mockResolvedValue({
      id: 5,
      name: 'CE',
      deletedAt: new Date(),
      kind: DocumentTypeKind.PERSON,
    });

    await expect(
      service.create({
        name: 'CE',
        digits: 9,
        description: 'Carné',
        kind: DocumentTypeKind.PERSON,
      }),
    ).rejects.toThrow(HttpException);
  });

  it('restaura un registro borrado sin perder compatibilidad del flujo', async () => {
    repository.findOne
      .mockResolvedValueOnce({
        id: 10,
        name: 'Pasaporte',
        deletedAt: new Date(),
        kind: null,
      })
      .mockResolvedValueOnce(null);
    repository.save.mockImplementation((value: DocumentType) =>
      Promise.resolve(value),
    );

    const result = await service.restore(10);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, deletedAt: null }),
    );
    expect(result.ok).toBe(true);
  });

  it('rechaza restore si el nombre ya lo usa otro registro activo', async () => {
    repository.findOne
      .mockResolvedValueOnce({
        id: 10,
        name: 'Pasaporte',
        deletedAt: new Date(),
        kind: null,
      })
      .mockResolvedValueOnce({ id: 99 });

    await expect(service.restore(10)).rejects.toThrow(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('borra en bulk usando la cantidad encontrada', async () => {
    repository.count.mockResolvedValue(2);
    repository.softDelete.mockResolvedValue({ affected: 2 });

    const result = await service.bulkSoftDelete([1, 2]);

    expect(repository.softDelete).toHaveBeenCalledWith([1, 2]);
    expect(result).toEqual({
      ok: true,
      message: '2 document types deleted successfully',
    });
  });

  it('rechaza bulk restore sin ids', async () => {
    await expect(service.bulkRestore([])).rejects.toThrow(BadRequestException);
  });

  it('rechaza bulk restore si restaurar un borrado entra en conflicto por nombre con uno activo', async () => {
    repository.count.mockResolvedValue(1);
    repository.findOne
      .mockResolvedValueOnce({
        id: 12,
        name: 'RUC',
        deletedAt: new Date(),
        kind: DocumentTypeKind.COMPANY,
      })
      .mockResolvedValueOnce({ id: 77 });

    await expect(service.bulkRestore([12])).rejects.toThrow(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('usa búsqueda compatible con MySQL normalizando a lowercase', async () => {
    const queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.findAll({ search: 'DNI' });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'LOWER(documentType.name) LIKE :search',
      { search: '%dni%' },
    );
  });

  it('lanza not found al buscar un id inexistente', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });
});
