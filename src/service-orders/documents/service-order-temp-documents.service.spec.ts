import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ServiceOrderTempDocumentsService } from './service-order-temp-documents.service';

type MockRepo = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  delete: jest.Mock;
};

const createMockRepo = (): MockRepo => ({
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => ({ id: 1, ...value })),
  findOne: jest.fn(),
  find: jest.fn(),
  delete: jest.fn(),
});

describe('ServiceOrderTempDocumentsService', () => {
  let repository: MockRepo;
  let service: ServiceOrderTempDocumentsService;

  beforeEach(() => {
    repository = createMockRepo();
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'SERVICE_ORDER_TEMP_DOCUMENT_TTL_MINUTES') return '1440';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new ServiceOrderTempDocumentsService(repository as any, configService);
  });

  it('creates a temporary document record with token and expiry', async () => {
    const result = await service.createRecord({
      sourceType: 'ORDER_INTAKE_SUMMARY',
      mimeType: 'application/pdf',
      fileName: 'resumen-ordenes.pdf',
      absolutePath: 'C:/tmp/resumen-ordenes.pdf',
      expiresAt: new Date('2026-05-18T12:00:00.000Z'),
      metadata: { orderIds: [1, 2] },
    });

    expect(result.token).toBeTruthy();
    expect(result.fileName).toBe('resumen-ordenes.pdf');
    expect(result.mimeType).toBe('application/pdf');
  });

  it('deletes expired files and records', async () => {
    const directory = join(process.cwd(), 'storage', 'temp', 'jest');
    await fs.mkdir(directory, { recursive: true });
    const absolutePath = join(directory, 'expired.pdf');
    await fs.writeFile(absolutePath, 'expired');
    repository.find.mockResolvedValue([
      {
        id: 1,
        token: 'expired',
        absolutePath,
        expiresAt: new Date('2026-05-18T10:00:00.000Z'),
      },
    ]);

    await service.deleteExpiredDocuments();

    await expect(fs.access(absolutePath)).rejects.toThrow();
    expect(repository.delete).toHaveBeenCalledWith({ id: 1 });
  });
});
