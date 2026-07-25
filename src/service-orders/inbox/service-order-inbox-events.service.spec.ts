import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ServiceOrderInboxEventsService } from './service-order-inbox-events.service';

describe('ServiceOrderInboxEventsService', () => {
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
