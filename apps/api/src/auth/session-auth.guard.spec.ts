import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard';

describe('SessionAuthGuard', () => {
  const request: Record<string, unknown> = {};
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  it('blocks an unauthenticated request', async () => {
    const guard = new SessionAuthGuard({
      authenticateRequest: jest.fn().mockResolvedValue(null),
    } as never);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the authenticated session user', async () => {
    const user = { id: 'member-a', role: 'MEMBER' };
    const guard = new SessionAuthGuard({
      authenticateRequest: jest.fn().mockResolvedValue(user),
    } as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBe(user);
  });
});
