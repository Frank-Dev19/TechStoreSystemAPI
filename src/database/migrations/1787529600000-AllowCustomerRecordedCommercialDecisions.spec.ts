import { QueryRunner } from 'typeorm';
import { AllowCustomerRecordedCommercialDecisions1787529600000 } from './1787529600000-AllowCustomerRecordedCommercialDecisions';

describe('AllowCustomerRecordedCommercialDecisions1787529600000', () => {
  it('permite decisiones registradas directamente por el cliente', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;

    await new AllowCustomerRecordedCommercialDecisions1787529600000().up(
      queryRunner,
    );

    const queries = (queryRunner.query as jest.Mock).mock.calls.map(
      ([query]) => query,
    );
    expect(queries).toEqual(
      expect.arrayContaining([
        expect.stringContaining('MODIFY `recorded_by_user_id` int NULL'),
        expect.stringContaining('ON DELETE SET NULL'),
      ]),
    );
  });
});
