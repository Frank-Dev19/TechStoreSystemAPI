import { getEffectivePermissionCodes } from './effective-permissions.util';

describe('getEffectivePermissionCodes', () => {
  it('combina permisos de roles y aplica overrides allow/deny vigentes', () => {
    const user = {
      roles: [
        { permissions: [{ code: 'clients.read' }, { code: 'clients.delete' }] },
        { permissions: [{ code: 'sales.read' }] },
      ],
      overrides: [
        { effect: 'deny', permission: { code: 'clients.delete' }, expiresAt: null },
        { effect: 'allow', permission: { code: 'inventory-kardex.read' }, expiresAt: null },
      ],
    };

    expect(getEffectivePermissionCodes(user)).toEqual([
      'clients.read',
      'inventory-kardex.read',
      'sales.read',
    ]);
  });

  it('ignora overrides expirados', () => {
    const user = {
      roles: [{ permissions: [{ code: 'clients.read' }] }],
      overrides: [
        {
          effect: 'deny',
          permission: { code: 'clients.read' },
          expiresAt: new Date('2026-08-16T00:00:00Z'),
        },
      ],
    };

    expect(getEffectivePermissionCodes(user, new Date('2026-08-17T00:00:00Z'))).toEqual([
      'clients.read',
    ]);
  });
});
