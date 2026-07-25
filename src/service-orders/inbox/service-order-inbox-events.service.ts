import { Injectable, MessageEvent } from '@nestjs/common';
import { interval, map, merge, Observable, Subject } from 'rxjs';

export type ServiceOrderInboxEvent = {
  type: 'inbox.changed' | 'heartbeat';
};

@Injectable()
export class ServiceOrderInboxEventsService {
  private readonly changes = new Subject<ServiceOrderInboxEvent>();

  publishChanged(): void {
    this.changes.next({ type: 'inbox.changed' });
  }

  stream(): Observable<MessageEvent> {
    const changeEvents = this.changes.pipe(
      map((event) => ({ type: event.type, data: event })),
    );
    const heartbeats = interval(25_000).pipe(
      map(() => ({
        type: 'heartbeat',
        data: { type: 'heartbeat' } satisfies ServiceOrderInboxEvent,
      })),
    );

    return merge(changeEvents, heartbeats);
  }
}
