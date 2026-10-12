import { ServiceOrderMessageMatrixService } from './service-order-message-matrix.service';

describe('Notification review', () => {
  const setup = () => {
    const notification = { id: 1, status: 'FAILED_FINAL', lastError: 'Meta rechazó', attemptCount: 7, nextAttemptAt: null };
    const repo = { findOne: jest.fn().mockResolvedValue(notification), update: jest.fn().mockResolvedValue({ affected: 1 }), findOneOrFail: jest.fn().mockResolvedValue(notification), find: jest.fn().mockResolvedValue([notification]) };
    const qb: any = { select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), groupBy: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([{ notificationId: '1', lastAttemptAt: '2026-10-12T19:37:15.000000Z' }]) };
    const attempts = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const channel = { dispatchTemplateMessage: jest.fn() };
    const service = new ServiceOrderMessageMatrixService(repo as any, attempts as any, {} as any, channel as any, {} as any);
    return { service, repo, notification, channel, attempts };
  };
  it('ignores atomically without clearing the error or sending a message', async () => {
    const { service, repo, channel } = setup();
    await service.ignoreFinalFailure(1);
    expect(repo.update).toHaveBeenCalledWith({ id: 1, status: 'FAILED_FINAL' }, { status: 'IGNORED', nextAttemptAt: null });
    expect(channel.dispatchTemplateMessage).not.toHaveBeenCalled();
  });
  it('does not ignore an already dispatched notification', async () => {
    const { service, notification, repo } = setup(); notification.status = 'SENT';
    await expect(service.ignoreFinalFailure(1)).rejects.toThrow();
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('rejects a race against a retry', async () => {
    const { service, repo } = setup(); repo.update.mockResolvedValue({ affected: 0 });
    await expect(service.ignoreFinalFailure(1)).rejects.toThrow();
  });
  it('returns the last actual attempt as UTC instead of the driver-shifted updatedAt', async () => {
    const { service, repo } = setup();
    const result = await service.listFinalFailures();
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'FAILED_FINAL' } }));
    expect(result[0].lastAttemptAt).toBe('2026-10-12T19:37:15.000000Z');
  });
});
