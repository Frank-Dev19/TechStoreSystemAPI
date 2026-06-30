import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { LessThan, Repository } from 'typeorm';
import { ServiceOrderTempDocument } from './service-order-temp-document.entity';

type CreateTempDocumentInput = {
  sourceType: string;
  mimeType: string;
  fileName: string;
  absolutePath: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class ServiceOrderTempDocumentsService {
  private readonly logger = new Logger(ServiceOrderTempDocumentsService.name);

  constructor(
    @InjectRepository(ServiceOrderTempDocument)
    private readonly tempDocumentRepository: Repository<ServiceOrderTempDocument>,
    private readonly configService: ConfigService,
  ) {}

  async createRecord(input: CreateTempDocumentInput): Promise<ServiceOrderTempDocument> {
    const record = this.tempDocumentRepository.create({
      token: randomBytes(32).toString('hex'),
      sourceType: input.sourceType,
      mimeType: input.mimeType,
      fileName: input.fileName,
      absolutePath: input.absolutePath,
      expiresAt: input.expiresAt ?? this.buildDefaultExpiry(),
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    });

    return this.tempDocumentRepository.save(record);
  }

  async resolveActiveDocumentByToken(token: string): Promise<ServiceOrderTempDocument> {
    const normalizedToken = String(token ?? '').trim();
    if (!normalizedToken) {
      throw new NotFoundException('Temporary document not found');
    }

    const record = await this.tempDocumentRepository.findOne({
      where: { token: normalizedToken },
    });

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException('Temporary document not found');
    }

    return record;
  }

  async resolveForDownload(token: string): Promise<ServiceOrderTempDocument> {
    return this.resolveActiveDocumentByToken(token);
  }

  @Cron('0 */15 * * * *')
  async deleteExpiredDocuments(): Promise<void> {
    const expiredDocuments = await this.tempDocumentRepository.find({
      where: { expiresAt: LessThan(new Date()) },
    });

    for (const document of expiredDocuments) {
      await this.deleteDocument(document);
    }
  }

  async deleteDocument(record: ServiceOrderTempDocument): Promise<void> {
    try {
      await fs.unlink(record.absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.warn(`Failed to delete temp document file ${record.absolutePath}: ${(error as Error).message}`);
      }
    }

    await this.tempDocumentRepository.delete({ id: record.id });
  }

  private buildDefaultExpiry(): Date {
    const ttlMinutes = Number(this.configService.get<string>('SERVICE_ORDER_TEMP_DOCUMENT_TTL_MINUTES') ?? '1440');
    const safeTtlMinutes = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 1440;
    return new Date(Date.now() + safeTtlMinutes * 60 * 1000);
  }
}
