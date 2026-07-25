import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, join, resolve, sep } from 'path';

@Injectable()
export class PrivateFileStorageService {
  private readonly root: string;

  constructor(configService: ConfigService) {
    this.root = resolve(configService.get<string>('PRIVATE_STORAGE_ROOT') ?? join(process.cwd(), 'storage'));
  }

  async store(namespace: string, segments: string[], fileName: string, buffer: Buffer) {
    const safeSegments = [namespace, ...segments].map((segment) => this.sanitizeSegment(segment));
    const directory = this.resolveInsideRoot(...safeSegments);
    await fs.mkdir(directory, { recursive: true });
    const safeName = basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment.bin';
    const absolutePath = this.resolveInsideRoot(...safeSegments, `${randomUUID()}-${safeName}`);
    await fs.writeFile(absolutePath, buffer, { flag: 'wx' });
    return { absolutePath };
  }

  private resolveInsideRoot(...segments: string[]): string {
    const target = resolve(this.root, ...segments);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      throw new Error('Private storage path escapes configured root');
    }
    return target;
  }

  private sanitizeSegment(value: string): string {
    const sanitized = String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!sanitized || sanitized === '.' || sanitized === '..') {
      throw new Error('Invalid private storage segment');
    }
    return sanitized;
  }
}
