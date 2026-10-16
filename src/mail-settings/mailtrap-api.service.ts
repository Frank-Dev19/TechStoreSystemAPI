import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ApiMailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}

@Injectable()
export class MailtrapApiService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('MAILTRAP_API_TOKEN')?.trim();
  }

  async send(sender: { fromEmail: string; fromName: string; replyTo?: string | null }, message: ApiMailMessage): Promise<{ messageId: string }> {
    const token = this.config.get<string>('MAILTRAP_API_TOKEN')?.trim();
    if (!token) throw new ServiceUnavailableException('Falta MAILTRAP_API_TOKEN en el servidor.');
    let response: Response;
    try {
      response = await fetch('https://send.api.mailtrap.io/api/send', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: { email: sender.fromEmail, name: sender.fromName },
          to: [{ email: message.to }],
          ...(sender.replyTo ? { reply_to: { email: sender.replyTo } } : {}),
          subject: message.subject,
          html: message.html,
          ...(message.text ? { text: message.text } : {}),
          ...(message.attachments?.length ? { attachments: message.attachments.map(attachment => ({
            filename: attachment.filename,
            content: Buffer.from(attachment.content).toString('base64'),
            type: attachment.contentType || 'application/octet-stream',
            disposition: 'attachment',
          })) } : {}),
        }),
      });
    } catch {
      throw new ServiceUnavailableException('No se pudo conectar con Mailtrap por HTTPS o se agotó el tiempo de espera. Comprueba los registros de Mailtrap antes de reintentar.');
    }
    if (!response.ok) {
      const hint = response.status === 401 ? 'Revisa el token del servidor.'
        : response.status === 403 ? 'Revisa la verificación del dominio y los permisos del token.'
        : response.status === 429 ? 'Se alcanzó un límite de envío; revisa el plan de Mailtrap.'
        : 'Revisa los registros de Mailtrap y la configuración del remitente.';
      throw new ServiceUnavailableException(`Mailtrap rechazó el envío (HTTP ${response.status}). ${hint}`);
    }
    let result: { success?: boolean; message_ids?: string[] };
    try { result = await response.json(); } catch {
      throw new ServiceUnavailableException('Mailtrap devolvió una respuesta inválida. Revisa sus registros antes de reintentar.');
    }
    if (result.success !== true || !Array.isArray(result.message_ids) || !result.message_ids.length) {
      throw new ServiceUnavailableException('Mailtrap no confirmó la aceptación del correo. Revisa sus registros antes de reintentar.');
    }
    return { messageId: result.message_ids[0] };
  }
}
