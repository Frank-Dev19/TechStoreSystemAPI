import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { createHash } from 'crypto';
import { MailPurpose } from '../mail-settings/enums/mail-purpose.enum';
import { MailSettingsService, ResolvedMailConfig } from '../mail-settings/mail-settings.service';

export interface MailAttachment {
    filename: string;
    content: Buffer | string;
    contentType?: string;
}

@Injectable()
export class MailerService {
    private readonly logger = new Logger(MailerService.name);
    private readonly transporters = new Map<MailPurpose, { fingerprint: string; transporter: nodemailer.Transporter }>();

    constructor(private readonly mailSettings: MailSettingsService) {}

    async sendMail(options: {
        to: string;
        subject: string;
        html: string;
        text?: string;
        attachments?: MailAttachment[];
        purpose?: MailPurpose;
    }) {
        const purpose = options.purpose ?? MailPurpose.ELECTRONIC_BILLING;
        const runtime = await this.mailSettings.resolveRuntimeConfig(purpose);
        const transporter = this.getTransporter(runtime);
        const info = await transporter.sendMail({
            from: this.formatAddress(runtime.fromName, runtime.fromEmail),
            replyTo: runtime.replyTo || undefined,
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
        const template = await this.prepareMessage(
            MailPurpose.PASSWORD_RESET,
            {
                subject: 'Restablecer contraseña',
                intro: 'Has solicitado restablecer tu contraseña.',
                footer: 'Si no solicitaste este cambio, ignora este mensaje.',
            },
            {},
        );
        const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:auto">
        <h2>${template.subjectHtml}</h2>
        <p>Hola ${this.escapeHtml(name ?? '')},</p>
        <p>${template.introHtml}</p>
        <p>Haz clic en el botón (válido por 20 minutos):</p>
        <p>
          <a href="${this.escapeAttribute(link)}" style="display:inline-block;padding:10px 16px;background:#138a42;color:#fff;border-radius:6px;text-decoration:none">
            Restablecer contraseña
          </a>
        </p>
        <p>${template.footerHtml}</p>
      </div>
    `;
        await this.sendMail({ to, subject: template.subject, html, purpose: MailPurpose.PASSWORD_RESET });
    }

    async prepareMessage(
        purpose: MailPurpose,
        defaults: { subject: string; intro: string; footer: string },
        variables: Record<string, string>,
    ) {
        const profile = await this.mailSettings.findForAdmin(purpose);
        const interpolate = (value: string) => Object.entries(variables).reduce(
            (result, [key, replacement]) => result.replaceAll(`{${key}}`, replacement),
            value,
        );
        const subject = interpolate(profile.subjectTemplate || defaults.subject);
        const intro = interpolate(profile.introText || defaults.intro);
        const footer = interpolate(profile.footerText || defaults.footer);
        return {
            subject,
            subjectHtml: this.escapeHtml(subject),
            introHtml: this.textToHtml(intro),
            footerHtml: this.textToHtml(footer),
        };
    }

    escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private getTransporter(runtime: ResolvedMailConfig): nodemailer.Transporter {
        const fingerprint = createHash('sha256').update(JSON.stringify({
            host: runtime.host,
            port: runtime.port,
            encryption: runtime.encryption,
            username: runtime.username,
            password: runtime.password,
        })).digest('hex');
        const cached = this.transporters.get(runtime.purpose);
        if (cached?.fingerprint === fingerprint) return cached.transporter;
        cached?.transporter.close();
        const transporter = nodemailer.createTransport(this.mailSettings.transportOptions(runtime));
        this.transporters.set(runtime.purpose, { fingerprint, transporter });
        return transporter;
    }

    private formatAddress(name: string, email: string): string {
        return name ? `"${name.replace(/"/g, '')}" <${email}>` : email;
    }

    private textToHtml(value: string): string {
        return this.escapeHtml(value).replace(/\r?\n/g, '<br>');
    }

    private escapeAttribute(value: string): string {
        return this.escapeHtml(value).replace(/`/g, '&#096;');
    }
}
