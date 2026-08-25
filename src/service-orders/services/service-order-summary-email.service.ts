import { BadRequestException, Injectable } from '@nestjs/common';
import { MailerService } from '../../mailer/mailer.service';
import { MailPurpose } from '../../mail-settings/enums/mail-purpose.enum';
import { JwtPayload } from '../../common/utils/jwt-payload.type';
import { ServiceOrderService } from './service-order.service';

@Injectable()
export class ServiceOrderSummaryEmailService {
  constructor(
    private readonly serviceOrderService: ServiceOrderService,
    private readonly mailerService: MailerService,
  ) {}

  async send(
    serviceOrderId: number,
    recipientOverride?: string,
    viewer?: Pick<JwtPayload, 'sub' | 'roles'>,
  ): Promise<{ ok: true; serviceOrderId: number; to: string; message: string }> {
    const order = await this.serviceOrderService.findOne(serviceOrderId, false, viewer);
    const to = (recipientOverride ?? order.clientSnapshotEmail ?? order.client?.email ?? '').trim();
    if (!to) {
      throw new BadRequestException('El cliente no tiene correo registrado.');
    }

    const summary = await this.serviceOrderService.generateSingleOrderSummaryPdf(serviceOrderId, viewer);
    const orderCode = order.code;
    const clientName = order.clientSnapshotName ?? order.client?.name ?? 'cliente';
    const safeName = this.mailerService.escapeHtml(clientName);
    const safeCode = this.mailerService.escapeHtml(orderCode);

    await this.mailerService.sendMail({
      to,
      subject: `Resumen de recepción ${orderCode}`,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:620px;margin:auto;color:#0f172a">
          <h2 style="margin-bottom:8px">Resumen de recepción</h2>
          <p>Hola ${safeName},</p>
          <p>Adjuntamos el resumen de recepción de tu orden de servicio.</p>
          <p><strong>Orden:</strong> ${safeCode}</p>
          <p>Conserva este documento para cualquier consulta o seguimiento.</p>
          <p>Gracias por confiar en Macrochips.</p>
        </div>
      `,
      text: `Resumen de recepción de la orden ${orderCode}. Se adjunta el documento PDF.`,
      attachments: [{
        filename: summary.fileName,
        content: summary.buffer,
        contentType: summary.mimeType,
      }],
      purpose: MailPurpose.ELECTRONIC_BILLING,
    });

    return {
      ok: true,
      serviceOrderId,
      to,
      message: 'Resumen de la orden enviado por correo.',
    };
  }
}
