import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';
import { Repository } from 'typeorm';
import { UpdateMailSettingDto } from './dto/update-mail-setting.dto';
import { MailSetting } from './entities/mail-setting.entity';
import { MailEncryption } from './enums/mail-encryption.enum';
import { MailPurpose } from './enums/mail-purpose.enum';

export interface ResolvedMailConfig {
  purpose: MailPurpose;
  host: string;
  port: number;
  encryption: MailEncryption;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  subjectTemplate?: string | null;
  introText?: string | null;
  footerText?: string | null;
  isActive: boolean;
}

@Injectable()
export class MailSettingsService {
  constructor(
    @InjectRepository(MailSetting) private readonly repo: Repository<MailSetting>,
    private readonly config: ConfigService,
  ) {}

  async findAllForAdmin() {
    return Promise.all(Object.values(MailPurpose).map((purpose) => this.findForAdmin(purpose)));
  }

  async findForAdmin(purpose: MailPurpose) {
    const entity = await this.findWithSecret(purpose);
    const fallback = this.getEnvironmentFallback(purpose);
    const resolved = this.merge(entity, fallback);
    const passwordSource = entity?.passwordEncrypted
      ? 'DATABASE'
      : fallback.password
        ? 'ENVIRONMENT'
        : 'NONE';

    return {
      purpose,
      host: resolved.host,
      port: resolved.port,
      encryption: resolved.encryption,
      username: resolved.username,
      fromName: resolved.fromName,
      fromEmail: resolved.fromEmail,
      replyTo: resolved.replyTo ?? null,
      subjectTemplate: resolved.subjectTemplate ?? null,
      introText: resolved.introText ?? null,
      footerText: resolved.footerText ?? null,
      isActive: resolved.isActive,
      hasPassword: passwordSource !== 'NONE',
      passwordSource,
      isConfigured: !!(
        resolved.host
        && resolved.port
        && resolved.username
        && resolved.fromEmail
        && passwordSource !== 'NONE'
      ),
      lastTestedAt: entity?.lastTestedAt ?? null,
      lastTestSuccessful: entity?.lastTestSuccessful ?? null,
      lastTestMessage: entity?.lastTestMessage ?? null,
      updatedAt: entity?.updatedAt ?? null,
    };
  }

  async upsert(purpose: MailPurpose, dto: UpdateMailSettingDto) {
    let entity = await this.findWithSecret(purpose);
    if (!entity) entity = this.repo.create({ purpose });

    Object.assign(entity, {
      host: dto.host.trim(),
      port: dto.port,
      encryption: dto.encryption,
      username: dto.username.trim(),
      fromName: dto.fromName.trim(),
      fromEmail: dto.fromEmail.trim().toLowerCase(),
      replyTo: this.cleanOptional(dto.replyTo),
      subjectTemplate: this.cleanOptional(dto.subjectTemplate),
      introText: this.cleanOptional(dto.introText),
      footerText: this.cleanOptional(dto.footerText),
      isActive: dto.isActive,
    });

    if (dto.password) entity.passwordEncrypted = this.encrypt(dto.password);
    const fallbackPassword = this.getEnvironmentFallback(purpose).password;
    if (!entity.passwordEncrypted && !fallbackPassword) {
      throw new BadRequestException('Debe ingresar la contraseña SMTP.');
    }

    await this.repo.save(entity);
    return this.findForAdmin(purpose);
  }

  async resolveRuntimeConfig(purpose: MailPurpose, allowInactive = false): Promise<ResolvedMailConfig> {
    const entity = await this.findWithSecret(purpose);
    const fallback = this.getEnvironmentFallback(purpose);
    const merged = this.merge(entity, fallback);
    const password = entity?.passwordEncrypted
      ? this.decrypt(entity.passwordEncrypted)
      : fallback.password;
    const runtime = { ...merged, purpose, password };

    if (!allowInactive && !runtime.isActive) {
      throw new ServiceUnavailableException('El envío de correos está desactivado para este tipo de mensaje.');
    }
    if (!this.isComplete(runtime)) {
      throw new ServiceUnavailableException('La configuración SMTP está incompleta.');
    }
    return runtime;
  }

  async test(purpose: MailPurpose, recipient?: string) {
    const runtime = await this.resolveRuntimeConfig(purpose, true);
    const transporter = nodemailer.createTransport(this.transportOptions(runtime));
    let successful = false;
    let message = 'Conexión SMTP verificada correctamente.';

    try {
      await transporter.verify();
      if (recipient) {
        const info = await transporter.sendMail({
          from: this.formatAddress(runtime.fromName, runtime.fromEmail),
          to: recipient,
          replyTo: runtime.replyTo || undefined,
          subject: 'Prueba de configuración de correo - Macrochips',
          text: 'La configuración SMTP de Macrochips funciona correctamente.',
          html: '<p>La configuración SMTP de <strong>Macrochips</strong> funciona correctamente.</p>',
        });
        message = `Correo de prueba enviado. ID: ${info.messageId}`;
      }
      successful = true;
      return { ok: true, message };
    } catch (error) {
      message = this.safeError(error);
      throw new BadRequestException(`No se pudo validar la configuración SMTP: ${message}`);
    } finally {
      await this.saveTestResult(purpose, runtime, successful, message);
      transporter.close();
    }
  }

  transportOptions(config: ResolvedMailConfig) {
    const secure = config.encryption === MailEncryption.SSL_TLS;
    return {
      host: config.host,
      port: config.port,
      secure,
      requireTLS: config.encryption === MailEncryption.STARTTLS,
      auth: { user: config.username, pass: config.password },
    };
  }

  private async findWithSecret(purpose: MailPurpose): Promise<MailSetting | null> {
    return this.repo.createQueryBuilder('setting')
      .addSelect('setting.passwordEncrypted')
      .where('setting.purpose = :purpose', { purpose })
      .getOne();
  }

  private merge(entity: MailSetting | null, fallback: ResolvedMailConfig): ResolvedMailConfig {
    if (!entity) return fallback;
    return {
      ...fallback,
      purpose: entity.purpose,
      host: entity.host,
      port: entity.port,
      encryption: entity.encryption,
      username: entity.username,
      fromName: entity.fromName,
      fromEmail: entity.fromEmail,
      replyTo: entity.replyTo,
      subjectTemplate: entity.subjectTemplate,
      introText: entity.introText,
      footerText: entity.footerText,
      isActive: entity.isActive,
    };
  }

  private getEnvironmentFallback(purpose: MailPurpose): ResolvedMailConfig {
    const billing = purpose === MailPurpose.ELECTRONIC_BILLING;
    const prefix = billing ? 'BILLING' : 'PASSWORD_RESET';
    const legacyFrom = this.parseFrom(
      this.config.get<string>(`${prefix}_MAIL_FROM`) || this.config.get<string>('MAIL_FROM') || '',
    );
    const port = Number(this.config.get<string>(`${prefix}_SMTP_PORT`) || this.config.get<string>('SMTP_PORT') || 587);
    const encryptionValue = this.config.get<string>(`${prefix}_SMTP_ENCRYPTION`);
    const encryption = encryptionValue && Object.values(MailEncryption).includes(encryptionValue as MailEncryption)
      ? encryptionValue as MailEncryption
      : port === 465 ? MailEncryption.SSL_TLS : MailEncryption.STARTTLS;

    return {
      purpose,
      host: this.config.get<string>(`${prefix}_SMTP_HOST`) || this.config.get<string>('SMTP_HOST') || '',
      port,
      encryption,
      username: this.config.get<string>(`${prefix}_SMTP_USER`) || this.config.get<string>('SMTP_USER') || '',
      password: this.config.get<string>(`${prefix}_SMTP_PASS`) || this.config.get<string>('SMTP_PASS') || '',
      fromName: legacyFrom.name || 'Macrochips',
      fromEmail: legacyFrom.email || this.config.get<string>(`${prefix}_SMTP_USER`) || this.config.get<string>('SMTP_USER') || '',
      replyTo: null,
      subjectTemplate: billing ? 'Comprobante electrónico {documento}' : 'Restablecer contraseña',
      introText: billing
        ? 'Adjuntamos su comprobante electrónico emitido por Macrochips.'
        : 'Has solicitado restablecer tu contraseña.',
      footerText: billing
        ? 'Gracias por confiar en Macrochips.'
        : 'Si no solicitaste este cambio, ignora este mensaje.',
      isActive: true,
    };
  }

  private async saveTestResult(
    purpose: MailPurpose,
    runtime: ResolvedMailConfig,
    successful: boolean,
    message: string,
  ) {
    let entity = await this.findWithSecret(purpose);
    if (!entity) {
      entity = this.repo.create({
        purpose,
        host: runtime.host,
        port: runtime.port,
        encryption: runtime.encryption,
        username: runtime.username,
        fromName: runtime.fromName,
        fromEmail: runtime.fromEmail,
        replyTo: runtime.replyTo,
        subjectTemplate: runtime.subjectTemplate,
        introText: runtime.introText,
        footerText: runtime.footerText,
        isActive: runtime.isActive,
      });
    }
    entity.lastTestedAt = new Date();
    entity.lastTestSuccessful = successful;
    entity.lastTestMessage = message.slice(0, 500);
    await this.repo.save(entity);
  }

  private isComplete(config: Partial<ResolvedMailConfig>): boolean {
    return !!(config.host && config.port && config.username && config.password && config.fromEmail);
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decrypt(value: string): string {
    const [version, iv, tag, encrypted] = value.split(':');
    if (version !== 'v1' || !iv || !tag || !encrypted) {
      throw new ServiceUnavailableException('No se pudo leer la contraseña SMTP almacenada.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  }

  private encryptionKey(): Buffer {
    const secret = this.config.get<string>('MAIL_SETTINGS_ENCRYPTION_KEY') || this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) throw new ServiceUnavailableException('Falta MAIL_SETTINGS_ENCRYPTION_KEY para proteger las credenciales SMTP.');
    return createHash('sha256').update(secret).digest();
  }

  private parseFrom(value: string): { name: string; email: string } {
    const match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
    if (match) return { name: match[1].trim(), email: match[2].trim() };
    return value.includes('@') ? { name: '', email: value.trim() } : { name: '', email: '' };
  }

  private formatAddress(name: string, email: string): string {
    return name ? `"${name.replace(/"/g, '')}" <${email}>` : email;
  }

  private cleanOptional(value?: string | null): string | null {
    const cleaned = value?.trim();
    return cleaned || null;
  }

  private safeError(error: unknown): string {
    const raw = error instanceof Error ? error.message : 'Error SMTP desconocido';
    return raw.replace(/(pass(word)?|auth)=?[^\s,;]*/gi, '$1=[PROTEGIDO]').slice(0, 500);
  }
}
