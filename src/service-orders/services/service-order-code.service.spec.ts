import { EntityManager } from 'typeorm';
import { ServiceOrderCodeService } from './service-order-code.service';

describe('ServiceOrderCodeService', () => {
  const manager = {
    query: jest.fn(),
  } as unknown as EntityManager;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('genera código padre diario e hijos correlativos en hora de Lima', async () => {
    (manager.query as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ sequenceNumber: 1 }]);
    const service = new ServiceOrderCodeService(() => new Date('2026-08-03T02:00:00.000Z'));

    const result = await service.allocate(manager, 2);

    expect(result).toEqual({
      parentCode: 'SO-02-08-2026-0001',
      itemCodes: ['SO-02-08-2026-0001-01', 'SO-02-08-2026-0001-02'],
      businessDate: '2026-08-02',
      sequenceNumber: 1,
    });
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'ON DUPLICATE KEY UPDATE `last_value` = LAST_INSERT_ID(`last_value` + 1)',
      ),
      ['2026-08-02'],
    );
  });

  it('rechaza una cantidad inválida de equipos antes de tocar la base', async () => {
    const service = new ServiceOrderCodeService();

    await expect(service.allocate(manager, 0)).rejects.toThrow('At least one service-order item is required');
    expect(manager.query).not.toHaveBeenCalled();
  });
});
