import { BadRequestException } from '@nestjs/common';
import { normalizeCustomerSummary, requireCustomerSummary } from './customer-summary';

describe('Customer quotation summary', () => {
  it('normalizes whitespace and preserves the customer wording', () => {
    expect(normalizeCustomerSummary('  Instalación\n de  dos RAM.  ')).toBe('Instalación de dos RAM.');
  });
  it('allows an incomplete draft but requires a summary for issuance', () => {
    expect(normalizeCustomerSummary('  ')).toBeNull();
    expect(() => requireCustomerSummary('  ')).toThrow(BadRequestException);
  });
  it('rejects invalid values and summaries exceeding 500 characters', () => {
    expect(() => normalizeCustomerSummary(42)).toThrow(BadRequestException);
    expect(() => normalizeCustomerSummary('a'.repeat(501))).toThrow(BadRequestException);
    expect(requireCustomerSummary('a'.repeat(500))).toHaveLength(500);
  });
});
