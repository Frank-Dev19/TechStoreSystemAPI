import { BadRequestException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DocumentType } from 'src/catalogs/document-types/entities/document-type.entity';
import { SupplierService } from './supplier.service';
import { Supplier } from './entities/supplier.entity';

type MockRepo<T = any> = {
  count: jest.Mock;
  findOne: jest.Mock;
  findAndCount: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  softDelete: jest.Mock;
};

const createMockRepo = (): MockRepo => ({
  count: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  softDelete: jest.fn(),
});

describe('SupplierService', () => {
  let service: SupplierService;
  let supplierRepository: MockRepo<Supplier>;
  let documentTypeRepository: MockRepo<DocumentType>;

  beforeEach(() => {
    supplierRepository = createMockRepo();
    documentTypeRepository = createMockRepo();
    service = new SupplierService(
      supplierRepository as unknown as Repository<Supplier>,
      documentTypeRepository as unknown as Repository<DocumentType>,
    );
  });

  it('borra suppliers en bulk reutilizando la validación común de ids', async () => {
    supplierRepository.count.mockResolvedValue(2);
    supplierRepository.softDelete.mockResolvedValue({ affected: 2 });

    const result = await service.bulkSoftDelete([3, 4]);

    expect(supplierRepository.softDelete).toHaveBeenCalledWith([3, 4]);
    expect(result).toEqual({
      ok: true,
      message: '2 suppliers deleted successfully',
    });
  });

  it('rechaza bulk restore sin ids', async () => {
    await expect(service.bulkRestore([])).rejects.toThrow(BadRequestException);
  });

  it('rechaza restore si ya existe otro supplier activo con el mismo documento', async () => {
    supplierRepository.findOne
      .mockResolvedValueOnce({
        id: 4,
        companyId: 1,
        documentTypeId: 2,
        documentNumber: '20123456789',
        deletedAt: new Date(),
      })
      .mockResolvedValueOnce({ id: 88 });

    await expect(service.restore(4)).rejects.toThrow(ConflictException);
    expect(supplierRepository.save).not.toHaveBeenCalled();
  });

  it('restaura suppliers en bulk manteniendo el mensaje esperado', async () => {
    supplierRepository.count.mockResolvedValue(2);
    supplierRepository.findOne
      .mockResolvedValueOnce({
        id: 10,
        companyId: 1,
        documentTypeId: 2,
        documentNumber: '10101010101',
        deletedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 11,
        companyId: 1,
        documentTypeId: 2,
        documentNumber: '20202020202',
        deletedAt: new Date(),
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    supplierRepository.save.mockImplementation(async (value) => value);

    const result = await service.bulkRestore([10, 11]);

    expect(supplierRepository.save).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: true,
      message: '2 suppliers restored successfully',
    });
  });

  it('rechaza bulk restore si un supplier borrado entra en conflicto con uno activo', async () => {
    supplierRepository.count.mockResolvedValue(1);
    supplierRepository.findOne
      .mockResolvedValueOnce({
        id: 12,
        companyId: 3,
        documentTypeId: 4,
        documentNumber: '20123456789',
        deletedAt: new Date(),
      })
      .mockResolvedValueOnce({ id: 93 });

    await expect(service.bulkRestore([12])).rejects.toThrow(ConflictException);
    expect(supplierRepository.save).not.toHaveBeenCalled();
  });

  it('restaura suppliers en bulk cuando el mismo documento sólo existe en otra company y valida la clave compuesta completa', async () => {
    const deletedAt = new Date();
    supplierRepository.count.mockResolvedValue(1);
    supplierRepository.findOne
      .mockResolvedValueOnce({
        id: 13,
        companyId: 5,
        documentTypeId: 4,
        documentNumber: '20123456789',
        deletedAt,
      })
      .mockResolvedValueOnce(null);
    supplierRepository.save.mockImplementation(async (value) => value);

    const result = await service.bulkRestore([13]);

    expect(supplierRepository.findOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 5,
          documentTypeId: 4,
          documentNumber: '20123456789',
        }),
        select: ['id'],
      }),
    );
    expect(supplierRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 13, deletedAt: null }),
    );
    expect(result).toEqual({
      ok: true,
      message: '1 suppliers restored successfully',
    });
  });

  it('restaura suppliers en bulk cuando el mismo documento sólo existe con otro documentType y valida la clave compuesta completa', async () => {
    const deletedAt = new Date();
    supplierRepository.count.mockResolvedValue(1);
    supplierRepository.findOne
      .mockResolvedValueOnce({
        id: 14,
        companyId: 3,
        documentTypeId: 7,
        documentNumber: '20123456789',
        deletedAt,
      })
      .mockResolvedValueOnce(null);
    supplierRepository.save.mockImplementation(async (value) => value);

    const result = await service.bulkRestore([14]);

    expect(supplierRepository.findOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 3,
          documentTypeId: 7,
          documentNumber: '20123456789',
        }),
        select: ['id'],
      }),
    );
    expect(supplierRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 14, deletedAt: null }),
    );
    expect(result).toEqual({
      ok: true,
      message: '1 suppliers restored successfully',
    });
  });
});
