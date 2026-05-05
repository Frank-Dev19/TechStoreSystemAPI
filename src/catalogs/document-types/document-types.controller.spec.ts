import { DocumentTypesController } from './document-types.controller';
import { DocumentTypesService } from './document-types.service';
import { DocumentType } from './entities/document-type.entity';
import { DocumentTypeKind } from './entities/document-type-kind.enum';

describe('DocumentTypesController', () => {
  let controller: DocumentTypesController;
  let service: jest.Mocked<DocumentTypesService>;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      bulkRestore: jest.fn(),
      update: jest.fn(),
      bulkSoftDelete: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
    } as unknown as jest.Mocked<DocumentTypesService>;

    controller = new DocumentTypesController(service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('reenvía kind al create', async () => {
    const createdDocumentType: DocumentType = {
      id: 1,
      name: 'RUC',
      digits: 11,
      description: 'Documento empresa',
      kind: DocumentTypeKind.COMPANY,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    service.create.mockResolvedValue(createdDocumentType);

    const payload = {
      name: 'RUC',
      digits: 11,
      description: 'Documento empresa',
      kind: DocumentTypeKind.COMPANY,
    };

    const result = await controller.create(payload);

    expect(service.create.mock.calls).toEqual([[payload]]);
    expect(result.kind).toBe(DocumentTypeKind.COMPANY);
  });

  it('reenvía kind al update', async () => {
    const updatedDocumentType: DocumentType = {
      id: 2,
      name: 'DNI',
      digits: 8,
      description: 'Documento natural',
      kind: DocumentTypeKind.PERSON,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    service.update.mockResolvedValue(updatedDocumentType);

    await controller.update('2', { kind: DocumentTypeKind.PERSON });

    expect(service.update.mock.calls).toEqual([
      [2, { kind: DocumentTypeKind.PERSON }],
    ]);
  });
});
