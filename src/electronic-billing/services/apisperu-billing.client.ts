import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApisPeruDocumentResponse, ApisPeruInvoicePayload } from '../dto/apisperu-invoice.types';

@Injectable()
export class ApisPeruBillingClient {
  private readonly defaultBaseUrl = 'https://facturacion.apisperu.com/api/v1';

  constructor(private readonly config: ConfigService) {}

  async sendInvoice(payload: ApisPeruInvoicePayload): Promise<ApisPeruDocumentResponse> {
    return this.postJson<ApisPeruDocumentResponse>('/invoice/send', payload);
  }

  async generateInvoicePdf(payload: ApisPeruInvoicePayload): Promise<Buffer> {
    return this.postBinary('/invoice/pdf', payload, 'application/pdf');
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const token = this.getToken();
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = this.parseResponse(text);

    if (!response.ok) {
      throw new BadRequestException({
        message: 'APIsPeru rechazo la solicitud de facturacion electronica.',
        status: response.status,
        response: data,
      });
    }

    return data as T;
  }

  private getBaseUrl(): string {
    const configured = this.config.get<string>('APIS_PERU_BASE_URL') || this.config.get<string>('APISPERU_BASE_URL');
    return (configured || this.defaultBaseUrl).replace(/\/+$/, '');
  }

  private getToken(): string {
    const token = this.config.get<string>('APIS_PERU_TOKEN') || this.config.get<string>('APISPERU_TOKEN');
    if (!token?.trim()) {
      throw new InternalServerErrorException('No se encontro APIS_PERU_TOKEN en el archivo .env.');
    }
    return token.trim();
  }

  private async postBinary(path: string, body: unknown, accept: string): Promise<Buffer> {
    const token = this.getToken();
    const baseUrl = this.getBaseUrl();

    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: accept,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new BadRequestException({
        message: 'APIsPeru rechazo la generacion del archivo.',
        status: response.status,
        response: this.parseResponse(text),
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private parseResponse(text: string): unknown {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
