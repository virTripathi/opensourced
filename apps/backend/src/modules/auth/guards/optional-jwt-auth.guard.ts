import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: any, user: any, info: any, context: ExecutionContext, status?: any): TUser {
    // If authentication failed or no token is provided, gracefully return undefined or null
    // rather than throwing UnauthorizedException
    if (err || !user) {
      return null as unknown as TUser;
    }
    return user;
  }
}
