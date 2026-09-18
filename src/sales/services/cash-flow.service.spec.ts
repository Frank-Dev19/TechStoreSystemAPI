import { CashFlowService } from './cash-flow.service';

describe('CashFlowService', () => {
  it('reconcilia el acumulado de devoluciones de una caja existente', async () => {
    const aggregateQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '85.50' }),
    };
    const cashRegisterRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 3, status: 'OPEN', totalReturns: 0 }),
    };
    const transactionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(aggregateQuery),
    };
    const service = new CashFlowService(cashRegisterRepo as any, transactionRepo as any, {} as any);

    await expect(service.getOpenRegister(1)).resolves.toEqual(
      expect.objectContaining({ id: 3, totalReturns: 85.5 }),
    );
  });

  it('calcula devoluciones como salidas para cada medio de pago', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { type: 'SALE', subtype: 'CASH', amount: 100 },
        { type: 'SALE', subtype: 'YAPE', amount: 60 },
        { type: 'RETURN', subtype: 'CASH', amount: -25 },
        { type: 'RETURN', subtype: 'YAPE', amount: -10 },
        // Compatibilidad con devoluciones antiguas que se guardaron positivas.
        { type: 'RETURN', subtype: 'CARD', amount: 5 },
      ]),
    };
    const transactionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new CashFlowService({} as any, transactionRepo as any, {} as any);

    await expect(service.getCashFlowMetrics(1, {})).resolves.toEqual({
      total: 120,
      cash: 75,
      card: -5,
      transfer: 0,
      yape: 50,
      plin: 0,
      returns: 40,
    });
  });
});
