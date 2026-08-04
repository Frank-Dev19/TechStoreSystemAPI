import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface MailAttachment {
    filename: string;
    content: Buffer | string;
    contentType?: string;
}

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
            secure: port === 465,
            auth: user && pass ? { user, pass } : undefined,
        });
    }

    async sendMail(options: {
        to: string;
        subject: string;
        html: string;
        text?: string;
        attachments?: MailAttachment[];
    }) {
        const from = this.cfg.get<string>('MAIL_FROM') || this.cfg.get<string>('SMTP_USER') || 'no-reply@yourdomain.com';
        const info = await this.transporter.sendMail({
            from,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            attachments: options.attachments,
        });

        this.logger.log(`Email queued -> ${info.messageId}`);
        return info;
    }

    async sendPasswordReset(to: string, link: string, name?: string) {
        const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:auto">
        <h2>Restablecer contrasena</h2>
        <p>Hola ${name ?? ''}, has solicitado restablecer tu contrasena.</p>
        <p>Haz clic en el boton (valido por 20 minutos):</p>
        <p>
          <a href="${link}" style="display:inline-block;padding:10px 16px;background:#2278b1;color:#fff;border-radius:8px;text-decoration:none">
            Restablecer contrasena
          </a>
        </p>
        <p>Si no fuiste tu, ignora este mensaje.</p>
      </div>
    `;
        await this.sendMail({ to, subject: 'Restablecer contrasena', html });
    }
}
