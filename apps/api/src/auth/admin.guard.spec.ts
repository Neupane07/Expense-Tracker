import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  function contextFor(role: Role) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('permits administrators to manage invitations', () => {
    expect(new AdminGuard().canActivate(contextFor(Role.ADMIN))).toBe(true);
  });

  it('denies members invitation administration', () => {
    expect(() => new AdminGuard().canActivate(contextFor(Role.MEMBER))).toThrow(
      ForbiddenException,
    );
  });
});
