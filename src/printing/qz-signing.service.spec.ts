import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  generateKeyPairSync,
  verify,
} from 'crypto';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { QzSigningService } from './qz-signing.service';

describe('QzSigningService', () => {
  let directory: string;
  let certificatePath: string;
  let privateKeyPath: string;
  let publicKey: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'qz-signing-'));
    certificatePath = join(directory, 'digital-certificate.txt');
    privateKeyPath = join(directory, 'private-key.pem');
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    publicKey = keys.publicKey;
    writeFileSync(certificatePath, 'PUBLIC QZ CERTIFICATE', 'utf8');
    writeFileSync(privateKeyPath, keys.privateKey, 'utf8');
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('returns the configured public certificate and signs payloads with SHA-512', () => {
    const service = createService({
      QZ_SIGNING_CERT_PATH: certificatePath,
      QZ_SIGNING_PRIVATE_KEY_PATH: privateKeyPath,
    });

    expect(service.getCertificate()).toBe('PUBLIC QZ CERTIFICATE');
    const payload = '{"call":"printers.find"}';
    const signature = service.sign(payload);

    expect(verify('SHA512', Buffer.from(payload), publicKey, Buffer.from(signature, 'base64'))).toBe(true);
  });

  it('fails closed when signing paths are not configured', () => {
    const service = createService({});

    expect(() => service.getCertificate()).toThrow(ServiceUnavailableException);
    expect(() => service.sign('payload')).toThrow(ServiceUnavailableException);
  });

  function createService(values: Record<string, string>): QzSigningService {
    const config = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    return new QzSigningService(config);
  }
});
