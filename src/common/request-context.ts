import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestCtx = {
  requestId?: string | null;
  userId?: number | null;
  actorEmail?: string | null;  // nuevo
  actorName?: string | null;   // nuevo
  ip?: string | null;
  userAgent?: string | null;
  method?: string | null;
  path?: string | null;
};

const als = new AsyncLocalStorage<RequestCtx>();

export const RequestContext = {
  get(): RequestCtx | undefined {
    return als.getStore();
  },
  run<T>(seed: RequestCtx, cb: () => T) {
    return als.run(seed, cb);
  },
  patch(patch: Partial<RequestCtx>) {
    const store = als.getStore();
    if (store) Object.assign(store, patch);
  },
};
