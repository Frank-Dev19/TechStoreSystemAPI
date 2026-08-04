import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Mutaciones comerciales sin WhatsApp de texto libre', () => {
  const readSource = (fileName: string): string =>
    readFileSync(join(__dirname, fileName), 'utf8');

  it.each([
    'service-order-commercial-revision.service.ts',
    'service-order-commercial-decision.service.ts',
    'service-agreements.service.ts',
  ])('%s no despacha mensajes libres directamente', (fileName) => {
    const source = readSource(fileName);

    expect(source).not.toMatch(/ServiceOrderInboxChannelService/);
    expect(source).not.toMatch(/dispatch(?:Text|FreeText)Message\s*\(/);
    expect(source).not.toMatch(/\.sendMessage\s*\(/);
  });

  it('la matriz usada por acuerdos solo entrega notificaciones mediante plantillas de Meta', () => {
    const source = readFileSync(
      join(__dirname, '..', 'services', 'service-order-message-matrix.service.ts'),
      'utf8',
    );

    expect(source).toContain('dispatchTemplateMessage');
    expect(source).not.toMatch(/dispatch(?:Text|FreeText)Message\s*\(/);
    expect(source).not.toMatch(/\.sendMessage\s*\(/);
  });
});
