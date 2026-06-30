import { BadRequestException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ClientService } from './client.service';
import { Client } from './entities/client.entity';
import { ClientContact } from './entities/client-contact.entity';
import { ClientKind } from './entities/client-kind.enum';
import { DocumentType } from '../catalogs/document-types/entities/document-type.entity';

type MockRepo<T = any> = {
  count: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  findAndCount: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  delete: jest.Mock;
  softDelete: jest.Mock;
  manager: {
    transaction: jest.Mock;
  };
};

const createMockRepo = (): MockRepo => ({
  count: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  delete: jest.fn(),
  softDelete: jest.fn(),
  manager: {
    transaction: jest.fn(),
  },
});

describe('ClientService', () => {
  let service: ClientService;
  let clientRepository: MockRepo<Client>;
  let clientContactRepository: MockRepo<ClientContact>;
  let documentTypeRepository: MockRepo<DocumentType>;
  let transactionClientRepository: MockRepo<Client>;
  let transactionClientContactRepository: MockRepo<ClientContact>;

  beforeEach(() => {
    clientRepository = createMockRepo();
    clientContactRepository = createMockRepo();
    documentTypeRepository = createMockRepo();
    transactionClientRepository = createMockRepo();
    transactionClientContactRepository = createMockRepo();

    clientRepository.manager.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: jest.fn((entity) => {
          if (entity === Client) {
            return transactionClientRepository;
          }
          if (entity === ClientContact) {
            return transactionClientContactRepository;
          }
          throw new Error('Unexpected repository requested in transaction');
        }),
      }),
    );

    service = new ClientService(
      clientRepository as unknown as Repository<Client>,
      clientContactRepository as unknown as Repository<ClientContact>,
      documentTypeRepository as unknown as Repository<DocumentType>,
    );
  });

  it('crea cliente PERSON sin contactos relacionados', async () => {
    documentTypeRepository.findOne.mockResolvedValue({ id: 1, digits: 8 });
    clientRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 1,
      companyId: 1,
      kind: ClientKind.PERSON,
      contacts: [],
    });
    transactionClientRepository.create.mockImplementation((value) => value);
    transactionClientRepository.save.mockImplementation(async (value) => ({
      ...value,
      id: 1,
    }));

    const result = await service.create({
      companyId: 1,
      kind: ClientKind.PERSON,
      name: 'Juan Perez',
      documentTypeId: 1,
      documentNumber: '12345678',
      phone: '+51 999 999 999',
    });

    expect(transactionClientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: ClientKind.PERSON,
        name: 'Juan Perez',
        phone: '+51999999999',
      }),
    );
    expect(transactionClientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresContactCompletion: false,
      }),
    );
    expect(transactionClientContactRepository.save).not.toHaveBeenCalled();
    expect(result.kind).toBe(ClientKind.PERSON);
  });

  it('crea cliente COMPANY con primer contacto primary', async () => {
    documentTypeRepository.findOne.mockResolvedValue({ id: 2, digits: 11 });
    clientRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 10,
      companyId: 1,
      kind: ClientKind.COMPANY,
      contacts: [{ id: 50, name: 'Ana', isPrimary: true }],
    });
    transactionClientRepository.create.mockImplementation((value) => value);
    transactionClientRepository.save.mockImplementation(async (value) => ({
      ...value,
      id: 10,
    }));
    transactionClientContactRepository.create.mockImplementation(
      (value) => value,
    );
    transactionClientContactRepository.save.mockImplementation(
      async (value) => value,
    );

    const result = await service.create({
      companyId: 1,
      kind: ClientKind.COMPANY,
      name: 'Mi Empresa SAC',
      tradeName: 'Mi Empresa',
      documentTypeId: 2,
      documentNumber: '12345678901',
      contacts: [{ name: 'Ana', phone: '+51 900 111 222' }],
    });

    expect(transactionClientContactRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Ana',
          phone: '+51900111222',
          isPrimary: true,
        }),
      ]),
    );
    expect(transactionClientRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ requiresContactCompletion: false }),
    );
    expect(result.kind).toBe(ClientKind.COMPANY);
  });

  it('crea cliente COMPANY preservando teléfono y correo de empresa separados del contacto', async () => {
    documentTypeRepository.findOne.mockResolvedValue({ id: 2, digits: 11 });
    clientRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 11,
      companyId: 1,
      kind: ClientKind.COMPANY,
      email: 'ventas@empresa.com',
      phone: '+51987654321',
      contacts: [
        {
          id: 51,
          name: 'Ana',
          email: 'ana@empresa.com',
          phone: '+51900111222',
          isPrimary: true,
        },
      ],
    });
    transactionClientRepository.create.mockImplementation((value) => value);
    transactionClientRepository.save.mockImplementation(async (value) => ({
      ...value,
      id: 11,
    }));
    transactionClientContactRepository.create.mockImplementation(
      (value) => value,
    );
    transactionClientContactRepository.save.mockImplementation(
      async (value) => value,
    );

    await service.create({
      companyId: 1,
      kind: ClientKind.COMPANY,
      name: 'Mi Empresa SAC',
      documentTypeId: 2,
      documentNumber: '12345678901',
      email: 'ventas@empresa.com',
      phone: '+51 987 654 321',
      contacts: [
        { name: 'Ana', email: 'ana@empresa.com', phone: '+51 900 111 222' },
      ],
    });

    expect(transactionClientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ventas@empresa.com',
        phone: '+51987654321',
      }),
    );
    expect(transactionClientContactRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Ana',
          email: 'ana@empresa.com',
          phone: '+51900111222',
        }),
      ]),
    );
  });

  it('rechaza teléfonos no E.164 al crear cliente', async () => {
    documentTypeRepository.findOne.mockResolvedValue({ id: 1, digits: 8 });
    clientRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.create({
        companyId: 1,
        kind: ClientKind.PERSON,
        name: 'Juan Perez',
        documentTypeId: 1,
        documentNumber: '12345678',
        phone: '999999999',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(clientRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('rechaza empresa sin contactos sin persistir cliente', async () => {
    documentTypeRepository.findOne.mockResolvedValue({ id: 2, digits: 11 });
    clientRepository.findOne.mockResolvedValue(null);

    await expect(
      service.create({
        companyId: 1,
        kind: ClientKind.COMPANY,
        name: 'Empresa sin contacto',
        documentTypeId: 2,
        documentNumber: '12345678901',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(clientRepository.manager.transaction).not.toHaveBeenCalled();
    expect(transactionClientRepository.save).not.toHaveBeenCalled();
  });

  it('revierte la creación de empresa si falla la persistencia de contactos', async () => {
    documentTypeRepository.findOne.mockResolvedValue({ id: 2, digits: 11 });
    clientRepository.findOne.mockResolvedValueOnce(null);
    transactionClientRepository.create.mockImplementation((value) => value);
    transactionClientRepository.save.mockImplementation(async (value) => ({
      ...value,
      id: 21,
    }));
    transactionClientContactRepository.create.mockImplementation(
      (value) => value,
    );
    transactionClientContactRepository.save.mockRejectedValue(
      new Error('contact save failed'),
    );

    await expect(
      service.create({
        companyId: 1,
        kind: ClientKind.COMPANY,
        name: 'Empresa con rollback',
        documentTypeId: 2,
        documentNumber: '10987654321',
        contacts: [
          { name: 'Principal', phone: '+51999111222', isPrimary: true },
        ],
      }),
    ).rejects.toThrow('contact save failed');

    expect(clientRepository.manager.transaction).toHaveBeenCalled();
    expect(transactionClientRepository.save).toHaveBeenCalled();
    expect(transactionClientContactRepository.save).toHaveBeenCalled();
  });

  it('al actualizar contactos deja solo uno como primary', async () => {
    const currentClient = {
      id: 15,
      companyId: 1,
      kind: ClientKind.COMPANY,
      documentTypeId: 2,
      documentNumber: '12345678901',
      deletedAt: null,
    } as Client;

    clientRepository.findOne
      .mockResolvedValueOnce(currentClient)
      .mockResolvedValueOnce({
        ...currentClient,
        contacts: [
          { id: 71, name: 'Nuevo', isPrimary: true },
          { id: 70, name: 'Anterior', isPrimary: false },
        ],
      });
    documentTypeRepository.findOne.mockResolvedValue({ id: 2, digits: 11 });
    clientRepository.save.mockImplementation(async (value) => value);
    clientContactRepository.save.mockImplementation(async (value) => value);

    await service.update(15, {
      kind: ClientKind.COMPANY,
      contacts: [
        { id: 70, name: 'Anterior', isPrimary: false },
        { id: 71, name: 'Nuevo', isPrimary: true },
      ],
    });

    expect(clientRepository.save).toHaveBeenCalledWith(
      expect.not.objectContaining({
        contacts: expect.anything(),
      }),
    );
    expect(clientContactRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ id: 70, isPrimary: false }),
      expect.objectContaining({ id: 71, isPrimary: true }),
    ]);
  });

  it('actualiza cliente COMPANY sin perder teléfono y correo top-level cuando también actualiza contactos', async () => {
    const currentClient = {
      id: 16,
      companyId: 1,
      kind: ClientKind.COMPANY,
      documentTypeId: 2,
      documentNumber: '12345678901',
      email: 'legacy@empresa.com',
      phone: '+51911111111',
      deletedAt: null,
    } as Client;

    clientRepository.findOne
      .mockResolvedValueOnce(currentClient)
      .mockResolvedValueOnce({
        ...currentClient,
        email: 'ventas@empresa.com',
        phone: '+51987654321',
        contacts: [
          {
            id: 80,
            name: 'Principal',
            email: 'principal@empresa.com',
            phone: '+51900111222',
            isPrimary: true,
          },
        ],
      });
    clientRepository.save.mockImplementation(async (value) => value);
    clientContactRepository.save.mockImplementation(async (value) => value);

    await service.update(16, {
      kind: ClientKind.COMPANY,
      email: 'ventas@empresa.com',
      phone: '+51 987 654 321',
      contacts: [
        {
          id: 80,
          name: 'Principal',
          email: 'principal@empresa.com',
          phone: '+51 900 111 222',
          isPrimary: true,
        },
      ],
    });

    expect(clientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 16,
        email: 'ventas@empresa.com',
        phone: '+51987654321',
      }),
    );
    expect(clientContactRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 80,
        email: 'principal@empresa.com',
        phone: '+51900111222',
        isPrimary: true,
      }),
    ]);
  });

  it('borra clientes en bulk reutilizando la validación común de ids', async () => {
    clientRepository.count.mockResolvedValue(2);
    clientRepository.softDelete.mockResolvedValue({ affected: 2 });

    const result = await service.bulkSoftDelete([5, 6]);

    expect(clientRepository.softDelete).toHaveBeenCalledWith([5, 6]);
    expect(result).toEqual({
      ok: true,
      message: '2 clients deleted successfully',
    });
  });

  it('rechaza restore si ya existe otro cliente activo con el mismo documento', async () => {
    clientRepository.findOne
      .mockResolvedValueOnce({
        id: 17,
        companyId: 1,
        documentTypeId: 2,
        documentNumber: '12345678901',
        deletedAt: new Date(),
      })
      .mockResolvedValueOnce({ id: 90 });

    await expect(service.restore(17)).rejects.toThrow(ConflictException);
    expect(clientRepository.save).not.toHaveBeenCalled();
  });

  it('rechaza bulk restore si alguno entra en conflicto con un activo', async () => {
    clientRepository.count.mockResolvedValue(1);
    clientRepository.findOne
      .mockResolvedValueOnce({
        id: 18,
        companyId: 1,
        documentTypeId: 2,
        documentNumber: '20123456789',
        deletedAt: new Date(),
      })
      .mockResolvedValueOnce({ id: 91 });

    await expect(service.bulkRestore([18])).rejects.toThrow(ConflictException);
    expect(clientRepository.save).not.toHaveBeenCalled();
  });

  it('restaura cliente en bulk cuando el mismo documento sólo existe en otra company y valida la clave compuesta completa', async () => {
    const deletedAt = new Date();
    clientRepository.count.mockResolvedValue(1);
    clientRepository.findOne
      .mockResolvedValueOnce({
        id: 19,
        companyId: 7,
        documentTypeId: 2,
        documentNumber: '20123456789',
        deletedAt,
      })
      .mockResolvedValueOnce(null);
    clientRepository.save.mockImplementation(async (value) => value);

    const result = await service.bulkRestore([19]);

    expect(clientRepository.findOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 7,
          documentTypeId: 2,
          documentNumber: '20123456789',
        }),
        select: ['id'],
      }),
    );
    expect(clientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 19, deletedAt: null }),
    );
    expect(result).toEqual({
      ok: true,
      message: '1 clients restored successfully',
    });
  });

  it('restaura cliente en bulk cuando el mismo documento sólo existe con otro documentType y valida la clave compuesta completa', async () => {
    const deletedAt = new Date();
    clientRepository.count.mockResolvedValue(1);
    clientRepository.findOne
      .mockResolvedValueOnce({
        id: 20,
        companyId: 1,
        documentTypeId: 9,
        documentNumber: '20123456789',
        deletedAt,
      })
      .mockResolvedValueOnce(null);
    clientRepository.save.mockImplementation(async (value) => value);

    const result = await service.bulkRestore([20]);

    expect(clientRepository.findOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 1,
          documentTypeId: 9,
          documentNumber: '20123456789',
        }),
        select: ['id'],
      }),
    );
    expect(clientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 20, deletedAt: null }),
    );
    expect(result).toEqual({
      ok: true,
      message: '1 clients restored successfully',
    });
  });

  it('importa empresas legacy sin contactos y las marca pendientes de completar contacto', async () => {
    clientRepository.find.mockResolvedValue([]);
    clientRepository.save.mockImplementation(async (value) => value);
    documentTypeRepository.find.mockResolvedValue([
      { id: 2, digits: 11, kind: ClientKind.COMPANY, name: 'RUC' },
    ]);

    const result = await service.commitImport({
      companyId: 1,
      rows: [
        {
          rowNumber: 1,
          documentTypeId: 2,
          documentNumber: '20123456789',
          name: 'Empresa Legacy SAC',
          phone: '+51987654321',
        },
      ],
    });

    expect(clientRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: ClientKind.COMPANY,
        requiresContactCompletion: true,
      }),
    );
    expect(result.createdCount).toBe(1);
  });
});
