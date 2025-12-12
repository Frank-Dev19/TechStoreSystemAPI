// Enmascara campos sensibles y recorta payloads grandes
const SENSITIVE_KEYS = ['password', 'pass', 'token', 'authorization', 'secret', 'apiKey', 'api_key', 'refreshToken'];

export function maskValue(value: any): any {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (value.length > 2048) return value.slice(0, 2048) + '…';
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 200).map((v) => maskValue(v));
  }

  if (typeof value === 'object') {
    const out: any = {};
    const entries = Object.entries(value).slice(0, 200);
    for (const [k, v] of entries) {
      if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
        out[k] = '***MASKED***';
      } else {
        out[k] = maskValue(v);
      }
    }
    return out;
  }

  return value;
}

export function safeJson(input: any, maxDepth = 4): any {
  function _walk(v: any, depth: number): any {
    if (depth <= 0) return '[DEPTH_LIMIT]';
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return maskValue(v);
    if (Array.isArray(v)) return v.slice(0, 200).map((x) => _walk(x, depth - 1));
    const obj: any = {};
    for (const [k, vv] of Object.entries(v).slice(0, 200)) {
      obj[k] = SENSITIVE_KEYS.includes(k.toLowerCase()) ? '***MASKED***' : _walk(vv, depth - 1);
    }
    return obj;
  }
  try {
    return _walk(input, maxDepth);
  } catch {
    return '[UNSERIALIZABLE]';
  }
}
