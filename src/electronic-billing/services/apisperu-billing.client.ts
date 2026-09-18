import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApisPeruCancellationPayload,
  ApisPeruDocumentResponse,
  ApisPeruInvoicePayload,
  ApisPeruTicketResponse,
  ApisPeruTicketStatusResponse,
} from '../dto/apisperu-invoice.types';

@Injectable()
export class ApisPeruBillingClient {
  private readonly defaultBaseUrl = 'https://facturacion.apisperu.com/api/v1';

  constructor(private readonly config: ConfigService) {}

  async sendInvoice(
    payload: ApisPeruInvoicePayload,
  ): Promise<ApisPeruDocumentResponse> {
    return this.postJson<ApisPeruDocumentResponse>('/invoice/send', payload);
  }

  async generateInvoicePdf(payload: ApisPeruInvoicePayload): Promise<Buffer> {
    return this.postBinary('/invoice/pdf', payload, 'application/pdf');
  }

  async sendVoided(
    payload: ApisPeruCancellationPayload,
  ): Promise<ApisPeruTicketResponse> {
    return this.postJson<ApisPeruTicketResponse>('/voided/send', payload);
  }

  async getVoidedStatus(
    ticket: string,
    ruc?: string | null,
  ): Promise<ApisPeruTicketStatusResponse> {
    return this.getJson<ApisPeruTicketStatusResponse>('/voided/status', {
      ticket,
      ruc,
    });
  }

  async sendSummary(
    payload: ApisPeruCancellationPayload,
  ): Promise<ApisPeruTicketResponse> {
    return this.postJson<ApisPeruTicketResponse>('/summary/send', payload);
  }

  async sendCreditNote(payload: unknown): Promise<ApisPeruDocumentResponse> {
    return this.postJson<ApisPeruDocumentResponse>('/note/send', payload);
  }

  async generateCreditNotePdf(payload: unknown): Promise<Buffer> {
    return this.postBinary('/note/pdf', payload, 'application/pdf');
  }

  async getSummaryStatus(
    ticket: string,
    ruc?: string | null,
  ): Promise<ApisPeruTicketStatusResponse> {
    return this.getJson<ApisPeruTicketStatusResponse>('/summary/status', {
      ticket,
      ruc,
    });
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const token = this.getToken();
    const baseUrl = this.getBaseUrl();

    const response = await this.fetchFromProvider(`${baseUrl}${path}`, {
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

  private async getJson<T>(
    path: string,
    params: Record<string, string | null | undefined>,
  ): Promise<T> {
    const token = this.getToken();
    const url = new URL(`${this.getBaseUrl()}${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });

    const response = await this.fetchFromProvider(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await response.text();
    const data = this.parseResponse(text);
    if (!response.ok) {
      throw new BadRequestException({
        message: 'APIsPeru rechazo la consulta de facturacion electronica.',
        status: response.status,
        response: data,
      });
    }
    return data as T;
  }

  private getBaseUrl(): string {
    const configured =
      this.config.get<string>('APIS_PERU_BASE_URL') ||
      this.config.get<string>('APISPERU_BASE_URL');
    return (configured || this.defaultBaseUrl).replace(/\/+$/, '');
  }

  private getToken(): string {
    const token =
      this.config.get<string>('APIS_PERU_TOKEN') ||
      this.config.get<string>('APISPERU_TOKEN');
    if (!token?.trim()) {
      throw new InternalServerErrorException(
        'No se encontro APIS_PERU_TOKEN en el archivo .env.',
      );
    }
    return token.trim();
  }

  private async postBinary(
    path: string,
    body: unknown,
    accept: string,
  ): Promise<Buffer> {
    const token = this.getToken();
    const baseUrl = this.getBaseUrl();

    const response = await this.fetchFromProvider(`${baseUrl}${path}`, {
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

  private async fetchFromProvider(
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(input, init);
    } catch (error) {
      const providerErrorCode = this.getProviderErrorCode(error);
      throw new ServiceUnavailableException({
        message:
          'No se pudo conectar con APIs Peru. Verifique la conexion a facturacion.apisperu.com e intente nuevamente.',
        provider: 'APIS_PERU',
        retryable: true,
        ...(providerErrorCode ? { code: providerErrorCode } : {}),
      });
    }
  }

  private getProviderErrorCode(error: unknown): string | null {
    if (!error || typeof error !== 'object' || !('cause' in error)) return null;

    const cause = error.cause;
    if (!cause || typeof cause !== 'object' || !('code' in cause)) return null;

    return typeof cause.code === 'string' ? cause.code : null;
  }
}
