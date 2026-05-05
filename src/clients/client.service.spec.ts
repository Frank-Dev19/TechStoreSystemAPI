import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ClientService } from './client.service';
import { Client } from './entities/client.entity';
import { ClientContact } from './entities/client-contact.entity';
import { ClientKind } from './entities/client-kind.enum';
import { DocumentType } from '../catalogs/document-types/entities/document-type.entity';

type MockRepo<T = any> = {
  findOne: jest.Mock;
  find: jest.Mock;
  findAndCount: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  delete: jest.Mock;
  manager: {
    transaction: jest.Mock;
  };
};

const createMockRepo = (): MockRepo => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  save: jest.fn(),
  create: jest.fn((value) => value),
  delete: jest.fn(),
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
    transactionClientRepository.save.mockImplementation(async (value) => ({ ...value, id: 1 }));

    const result = await service.create({
      companyId: 1,
      kind: ClientKind.PERSON,
      name: 'Juan Perez',
      documentTypeId: 1,
      documentNumber: '12345678',
      phone: '999999999',
    });

    expect(transactionClientRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: ClientKind.PERSON, name: 'Juan Perez' }),
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
    transactionClientRepository.save.mockImplementation(async (value) => ({ ...value, id: 10 }));
    transactionClientContactRepository.create.mockImplementation((value) => value);
    transactionClientContactRepository.save.mockImplementation(async (value) => value);

    const result = await service.create({
      companyId: 1,
      kind: ClientKind.COMPANY,
      name: 'Mi Empresa SAC',
      tradeName: 'Mi Empresa',
      documentTypeId: 2,
      documentNumber: '12345678901',
      contacts: [{ name: 'Ana', phone: '900111222' }],
    });

    expect(transactionClientContactRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'Ana', isPrimary: true })]),
    );
    expect(result.kind).toBe(ClientKind.COMPANY);
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
    transactionClientRepository.save.mockImplementation(async (value) => ({ ...value, id: 21 }));
    transactionClientContactRepository.create.mockImplementation((value) => value);
    transactionClientContactRepository.save.mockRejectedValue(new Error('contact save failed'));

    await expect(
      service.create({
        companyId: 1,
        kind: ClientKind.COMPANY,
        name: 'Empresa con rollback',
        documentTypeId: 2,
        documentNumber: '10987654321',
        contacts: [{ name: 'Principal', phone: '999111222', isPrimary: true }],
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

    expect(clientRepository.save).toHaveBeenCalledWith(expect.not.objectContaining({
      contacts: expect.anything(),
    }));
    expect(clientContactRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ id: 70, isPrimary: false }),
      expect.objectContaining({ id: 71, isPrimary: true }),
    ]);
  });
});
