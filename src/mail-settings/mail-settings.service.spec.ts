import { ConfigService } from '@nestjs/config';
import { MailSettingsService } from './mail-settings.service';
import { MailPurpose } from './enums/mail-purpose.enum';
import { MailEncryption } from './enums/mail-encryption.enum';
import { MailerService } from '../mailer/mailer.service';

describe('Mailtrap mail settings integration', () => {
  let settings: MailSettingsService;
  let api: any;
  let repo: any;
  let entity: any;
  beforeEach(() => {
    entity = { purpose: MailPurpose.ELECTRONIC_BILLING, host: '', port: 465, encryption: MailEncryption.SSL_TLS, username: '', fromName: 'Macrochips', fromEmail: 'testeo@macrochips.com', isActive: true, passwordEncrypted: 'legacy-secret-not-decryptable' };
    const query: any = { addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getOne: jest.fn(async () => entity) };
    repo = { createQueryBuilder: () => query, save: jest.fn(async e => e), create: jest.fn(e => e) };
    api = { isConfigured: jest.fn(() => true), send: jest.fn(async () => ({ messageId: 'accepted' })) };
    settings = new MailSettingsService(repo, new ConfigService({ MAIL_TRANSPORT: 'MAILTRAP_API' }), api);
  });
  it('uses API without requiring SMTP or decrypting legacy SMTP passwords', async () => {
    await expect(settings.resolveRuntimeConfig(MailPurpose.ELECTRONIC_BILLING)).resolves.toMatchObject({ password: '', fromEmail: 'testeo@macrochips.com' });
    const profile = await settings.findForAdmin(MailPurpose.ELECTRONIC_BILLING);
    expect(profile).toMatchObject({ transport: 'MAILTRAP_API', hasApiToken: true, isConfigured: true });
    expect(profile).not.toHaveProperty('passwordEncrypted');
  });
  it('preserves inactive profile protection', async () => {
    entity.isActive = false;
    await expect(settings.resolveRuntimeConfig(MailPurpose.ELECTRONIC_BILLING)).rejects.toThrow('desactivado');
  });
  it('requires an actual recipient before a Mailtrap test and does not send otherwise', async () => {
    await expect(settings.test(MailPurpose.ELECTRONIC_BILLING)).rejects.toThrow('destinatario');
    expect(api.send).not.toHaveBeenCalled();
  });
  it('records accepted test with provider ID without claiming inbox delivery', async () => {
    const result = await settings.test(MailPurpose.ELECTRONIC_BILLING, 'client@example.com');
    expect(result.message).toContain('aceptó');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ lastTestSuccessful: true }));
  });
  it('records failed test and preserves safe provider error', async () => {
    api.send.mockRejectedValue(new Error('Mailtrap HTTP 403'));
    await expect(settings.test(MailPurpose.ELECTRONIC_BILLING, 'client@example.com')).rejects.toThrow('403');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ lastTestSuccessful: false }));
  });
  it('routes all MailerService sends through API, retaining attachments', async () => {
    const message = { to: 'client@example.com', subject: 'Resumen', html: '<p>Resumen</p>', attachments: [{ filename: 'resumen.pdf', content: Buffer.from('pdf') }] };
    await expect(new MailerService(settings).sendMail(message)).resolves.toEqual({ messageId: 'accepted' });
    expect(api.send).toHaveBeenCalledWith(expect.objectContaining({ fromEmail: 'testeo@macrochips.com' }), message);
  });
  it('blocks missing token and does not silently fall back to SMTP', async () => {
    api.isConfigured.mockReturnValue(false);
    await expect(new MailerService(settings).sendMail({ to: 'client@example.com', subject: 'Test', html: 'Test' })).rejects.toThrow('MAILTRAP_API_TOKEN');
    expect(api.send).not.toHaveBeenCalled();
  });
  it('keeps bounded SMTP timeouts for existing installations', () => {
    expect(settings.transportOptions(entity)).toMatchObject({ secure: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
  });
});
