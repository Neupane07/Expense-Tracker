import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = await this.authService.authenticateRequest(request);

    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    request.user = user;
    return true;
  }
}
