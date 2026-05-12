export const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
export const E164_PHONE_MAX_LENGTH = 16;
const META_LEGACY_FALLBACK_COUNTRY_CODE = '51';

export function normalizePhoneInputForValidation(value: unknown): string | undefined {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return undefined;
  }

  const compact = trimmed.replace(/[\s().-]+/g, '');
  if (!compact) {
    return undefined;
  }

  if (compact.startsWith('+')) {
    const normalized = `+${compact.slice(1).replace(/\D+/g, '')}`;
    return normalized === '+' ? trimmed : normalized;
  }

  if (compact.startsWith('00')) {
    const normalized = `+${compact.slice(2).replace(/\D+/g, '')}`;
    return normalized === '+' ? trimmed : normalized;
  }

  return compact;
}

export function normalizePhoneToE164(value: unknown): string | undefined {
  const normalized = normalizePhoneInputForValidation(value);
  if (!normalized || !E164_PHONE_REGEX.test(normalized)) {
    return undefined;
  }
  return normalized;
}

export function normalizePhoneForMetaRecipient(value: unknown): string | undefined {
  const e164 = normalizeComparablePhone(value);
  if (e164) {
    return e164.slice(1);
  }
  return undefined;
}

export function normalizeComparablePhone(value: unknown): string | undefined {
  const e164 = normalizePhoneToE164(value);
  if (e164) {
    return e164;
  }

  const digits = String(value ?? '').replace(/\D+/g, '').trim();
  if (!digits) {
    return undefined;
  }

  if (digits.length === 9) {
    return `+${META_LEGACY_FALLBACK_COUNTRY_CODE}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith(META_LEGACY_FALLBACK_COUNTRY_CODE)) {
    return `+${digits}`;
  }

  return undefined;
}
