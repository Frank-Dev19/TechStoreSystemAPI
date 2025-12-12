import { Request } from 'express';

export function getRealIp(req: Request): string | null {
  const xfwd = req.headers['x-forwarded-for'];
  if (typeof xfwd === 'string' && xfwd.length > 0) {
    return xfwd.split(',')[0].trim();
  }
  if (Array.isArray(xfwd) && xfwd.length > 0) {
    return xfwd[0].split(',')[0].trim();
  }
  return (req.ip || req.socket?.remoteAddress || null);
}
