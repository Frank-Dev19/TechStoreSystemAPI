import { ConfigService } from '@nestjs/config';
import { MailtrapApiService } from './mailtrap-api.service';

describe('MailtrapApiService', () => {
  const originalFetch = global.fetch;
  const config = new ConfigService({ MAILTRAP_API_TOKEN: 'secret-token' });
  afterEach(() => { global.fetch = originalFetch; });
  it('sends corporate sender, reply-to and binary attachments over HTTPS', async () => {
    const request = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, message_ids: ['id-1'] }) });
    global.fetch = request;
    await expect(new MailtrapApiService(config).send({ fromEmail: 'testeo@macrochips.com', fromName: 'Macrochips', replyTo: 'contacto@macrochips.com' }, { to: 'client@example.com', subject: 'Comprobante', html: '<p>PDF</p>', attachments: [{ filename: 'a.pdf', content: Buffer.from([0, 255]), contentType: 'application/pdf' }] })).resolves.toEqual({ messageId: 'id-1' });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://send.api.mailtrap.io/api/send');
    expect(options.headers.Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(options.body)).toMatchObject({ from: { email: 'testeo@macrochips.com' }, reply_to: { email: 'contacto@macrochips.com' }, attachments: [{ content: 'AP8=', type: 'application/pdf' }] });
  });
  it('rejects missing tokens before sending', async () => {
    global.fetch = jest.fn();
    await expect(new MailtrapApiService(new ConfigService()).send({ fromEmail: 'a@example.com', fromName: 'A' }, { to: 'b@example.com', subject: 'Test', html: 'Test' })).rejects.toThrow('MAILTRAP_API_TOKEN');
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])('handles HTTP %i without exposing provider response or token', async status => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status, json: async () => ({ errors: ['secret-token'] }) });
    await expect(new MailtrapApiService(config).send({ fromEmail: 'a@example.com', fromName: 'A' }, { to: 'b@example.com', subject: 'Test', html: 'Test' })).rejects.toThrow(new RegExp(String(status)));
  });
  it('rejects malformed success responses without claiming delivery', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    await expect(new MailtrapApiService(config).send({ fromEmail: 'a@example.com', fromName: 'A' }, { to: 'b@example.com', subject: 'Test', html: 'Test' })).rejects.toThrow('no confirmó');
  });
  it('handles timeout without exposing credentials', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('secret-token'));
    await expect(new MailtrapApiService(config).send({ fromEmail: 'a@example.com', fromName: 'A' }, { to: 'b@example.com', subject: 'Test', html: 'Test' })).rejects.toThrow('No se pudo conectar');
  });
});
