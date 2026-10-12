import { Injectable, MessageEvent } from '@nestjs/common';
import {
  concatMap,
  filter,
  interval,
  map,
  merge,
  Observable,
  Subject,
} from 'rxjs';

export type ServiceOrderInboxEvent = {
  type: 'inbox.changed' | 'heartbeat';
  threadId?: number;
};

@Injectable()
export class ServiceOrderInboxEventsService {
  private readonly changes = new Subject<ServiceOrderInboxEvent>();

  publishChanged(threadId?: number): void {
    this.changes.next({
      type: 'inbox.changed',
      ...(threadId ? { threadId } : {}),
    });
  }

  stream(
    canRead?: (threadId: number) => Promise<boolean>,
  ): Observable<MessageEvent> {
    const changeEvents = this.changes.pipe(
      concatMap(async (event) => ({
        event,
        allowed: !event.threadId || !canRead || (await canRead(event.threadId)),
      })),
      filter((result) => result.allowed),
      map((result) => result.event),
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
