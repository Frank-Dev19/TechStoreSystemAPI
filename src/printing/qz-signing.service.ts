import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

@Injectable()
export class QzSigningService {
  constructor(private readonly config: ConfigService) {}

  getCertificate(): string {
    return this.readConfiguredFile(
      'QZ_SIGNING_CERT_PATH',
      'El certificado público de QZ Tray no está configurado.',
    );
  }

  sign(payload: string): string {
    const privateKey = this.readConfiguredFile(
      'QZ_SIGNING_PRIVATE_KEY_PATH',
      'La clave privada de QZ Tray no está configurada.',
    );
    const signer = createSign('SHA512');
    signer.update(payload, 'utf8');
    signer.end();
    return signer.sign(privateKey, 'base64');
  }

  private readConfiguredFile(variable: string, missingMessage: string): string {
    const configuredPath = this.config.get<string>(variable)?.trim();
    if (!configuredPath) throw new ServiceUnavailableException(missingMessage);

    try {
      return readFileSync(resolve(configuredPath), 'utf8');
    } catch {
      throw new ServiceUnavailableException(
        `${missingMessage} Verifica la ruta configurada en ${variable}.`,
      );
    }
  }
}
