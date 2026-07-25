import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PrivateFileStorageService } from './private-file-storage.service';

describe('PrivateFileStorageService', () => {
  it('stores files below the configured private root', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'private-storage-'));
    const service = new PrivateFileStorageService({
      get: jest.fn().mockReturnValue(root),
    } as unknown as ConfigService);

    const stored = await service.store('service-order-inbox', ['15'], 'evidence.pdf', Buffer.from('pdf'));

    expect(stored.absolutePath.startsWith(root)).toBe(true);
    await expect(fs.readFile(stored.absolutePath, 'utf8')).resolves.toBe('pdf');
    await fs.rm(root, { recursive: true, force: true });
  });
});
