import { SalesInventoryService } from './sales-inventory.service';

describe('SalesInventoryService', () => {
  it('passes the caller entity manager to every sale movement', async () => {
    const movementsService = { createMovement: jest.fn().mockResolvedValue({ id: 1 }) };
    const service = new SalesInventoryService(
      movementsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const manager = {} as any;

    await service.registerSaleMovement(
      15,
      [{ productId: 4, quantity: 2, lotId: 9, serialIds: [] }],
      'tester',
      manager,
    );

    expect(movementsService.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        source_doc_type: 'SALE',
        source_doc_id: '15',
      }),
      'tester',
      manager,
    );
  });
});
