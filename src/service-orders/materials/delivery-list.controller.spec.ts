import { DeliveryListController } from './delivery-list.controller';

describe('DeliveryListController RBAC', () => {
  const permissionsFor = (method: keyof DeliveryListController): string[] => {
    const metadata: unknown = Reflect.getMetadata(
      'perms',
      DeliveryListController.prototype[method],
    );
    return Array.isArray(metadata)
      ? metadata.filter((permission): permission is string => typeof permission === 'string')
      : [];
  };

  it('protects delivery queries with the read permission', () => {
    expect(permissionsFor('technicians')).toEqual(['internal-deliveries.read']);
    expect(permissionsFor('list')).toEqual(['internal-deliveries.read']);
  });

  it('protects manual delivery operations with the create permission', () => {
    expect(permissionsFor('options')).toEqual(['internal-deliveries.create']);
    expect(permissionsFor('createManual')).toEqual([
      'internal-deliveries.create',
    ]);
  });
});
