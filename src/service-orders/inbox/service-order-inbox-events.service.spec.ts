import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ServiceOrderInboxEventsService } from './service-order-inbox-events.service';

describe('ServiceOrderInboxEventsService', () => {
  it('only emits changes for conversations the viewer can read', async () => {
    const service = new ServiceOrderInboxEventsService();
    const canRead = jest.fn(async (id: number) => id === 8);
    const eventPromise = firstValueFrom(service.stream(canRead));
    service.publishChanged(7);
    service.publishChanged(8);
    await expect(eventPromise).resolves.toEqual({
      type: 'inbox.changed', data: { type: 'inbox.changed', threadId: 8 },
    });
    expect(canRead).toHaveBeenCalledWith(7);
    expect(canRead).toHaveBeenCalledWith(8);
  });

  it('emits a content-free inbox invalidation', async () => {
    const service = new ServiceOrderInboxEventsService();
    const eventPromise = firstValueFrom(
      service.stream().pipe(filter((event) => event.type === 'inbox.changed')),
    );

    service.publishChanged();

    await expect(eventPromise).resolves.toEqual({
      type: 'inbox.changed',
      data: { type: 'inbox.changed' },
    });
  });
});
