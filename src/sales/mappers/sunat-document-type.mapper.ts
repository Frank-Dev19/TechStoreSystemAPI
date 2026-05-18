import { BadRequestException } from '@nestjs/common';
import { DocumentType } from '../enums/document-type.enum';

export const SUNAT_DOCUMENT_TYPE_CODE: Record<DocumentType, string> = {
  [DocumentType.FACTURA]: '01',
  [DocumentType.BOLETA]: '03',
  [DocumentType.NOTA_CREDITO]: '07',
  [DocumentType.NOTA_DEBITO]: '08',
  [DocumentType.GUIA_REMISION]: '09',
};

export function mapDocumentTypeToSunatCode(documentType: DocumentType): string {
  const code = SUNAT_DOCUMENT_TYPE_CODE[documentType];
  if (!code) {
    throw new BadRequestException(`Tipo de documento no soportado para SUNAT: ${documentType}`);
  }
  return code;
}

export function normalizeDocumentSeriesCode(code: string): string {
  return String(code ?? '').trim().toUpperCase();
}

export function getSeriesPattern(documentType: DocumentType): RegExp {
  switch (documentType) {
    case DocumentType.FACTURA:
      return /^F\d{3}$/;
    case DocumentType.BOLETA:
      return /^B\d{3}$/;
    case DocumentType.NOTA_CREDITO:
      return /^(FC|BC)\d{2}$/;
    case DocumentType.NOTA_DEBITO:
      return /^(FD|BD)\d{2}$/;
    case DocumentType.GUIA_REMISION:
      return /^T\d{3}$/;
    default:
      throw new BadRequestException(`Tipo de documento no soportado para series: ${documentType}`);
  }
}

export function getSeriesFormatHint(documentType: DocumentType): string {
  switch (documentType) {
    case DocumentType.FACTURA:
      return 'Factura: F001, F002...';
    case DocumentType.BOLETA:
      return 'Boleta: B001, B002...';
    case DocumentType.NOTA_CREDITO:
      return 'Nota de crédito: FC01 o BC01';
    case DocumentType.NOTA_DEBITO:
      return 'Nota de débito: FD01 o BD01';
    case DocumentType.GUIA_REMISION:
      return 'Guía de remisión: T001, T002...';
    default:
      return 'Serie inválida';
  }
}

export function assertValidSeriesCode(documentType: DocumentType, code: string): string {
  const normalizedCode = normalizeDocumentSeriesCode(code);
  if (!getSeriesPattern(documentType).test(normalizedCode)) {
    throw new BadRequestException(`La serie ${normalizedCode || '(vacía)'} no es válida. ${getSeriesFormatHint(documentType)}.`);
  }
  return normalizedCode;
}
