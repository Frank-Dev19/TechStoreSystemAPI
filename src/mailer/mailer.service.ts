import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';


@Injectable()
export class MailerService {

    private readonly logger = new Logger(MailerService.name);
    private transporter: nodemailer.Transporter;

    constructor(private cfg: ConfigService) {
        const host = this.cfg.get<string>('SMTP_HOST');
        const port = +this.cfg.get<string>('SMTP_PORT', '587');
        const user = this.cfg.get<string>('SMTP_USER');
        const pass = this.cfg.get<string>('SMTP_PASS');

        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465, // true para 465, false para otros
            auth: user && pass ? { user, pass } : undefined,
        });
    }

    async sendPasswordReset(to: string, link: string, name?: string) {
        const from = this.cfg.get<string>('MAIL_FROM') || 'no-reply@yourdomain.com';
        const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:auto">
        <h2>Restablecer contraseña</h2>
        <p>Hola ${name ?? ''}, has solicitado restablecer tu contraseña.</p>
        <p>Haz clic en el botón (válido por 20 minutos):</p>
        <p>
          <a href="${link}" style="display:inline-block;padding:10px 16px;background:#2278b1;color:#fff;border-radius:8px;text-decoration:none">
            Restablecer contraseña
          </a>
        </p>
        <p>Si no fuiste tú, ignora este mensaje.</p>
      </div>
    `;
        const info = await this.transporter.sendMail({ from, to, subject: 'Restablecer contraseña', html });
        this.logger.log(`Reset email queued -> ${info.messageId}`);
    }


}
