import { BadRequestException, Injectable } from '@nestjs/common';
import { serviceOrderTransitionMap, ServiceOrderTransitionAxis } from './service-order-transition-map';

@Injectable()
export class ServiceOrderTransitionPolicy {
  canTransition(axis: ServiceOrderTransitionAxis, from: string, to: string): boolean {
    const transitions = serviceOrderTransitionMap[axis] as Record<string, readonly string[]>;
    return (transitions[from] ?? []).includes(to);
  }

  assertTransition(axis: ServiceOrderTransitionAxis, from: string, to: string): void {
    if (!this.canTransition(axis, from, to)) {
      throw new BadRequestException(`Invalid service order transition for axis ${axis}: ${from} -> ${to}`);
    }
  }

  getAllowedTransitions(axis: ServiceOrderTransitionAxis, from: string): readonly string[] {
    const transitions = serviceOrderTransitionMap[axis] as Record<string, readonly string[]>;
    return transitions[from] ?? [];
  }
}
