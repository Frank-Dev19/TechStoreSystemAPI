import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../../common/utils/jwt-payload.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request?.user as JwtPayload | undefined;
    return user?.sub;
  },
);
