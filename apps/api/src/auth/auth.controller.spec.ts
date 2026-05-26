import { Logger } from '@nestjs/common';
import { InviteRequiredException } from './auth.errors';
import { AuthController } from './auth.controller';

describe('AuthController callback errors', () => {
  function response() {
    return {
      redirect: jest.fn(),
    };
  }

  it('shows invitation guidance only for a missing invitation', async () => {
    const authService = {
      finishGoogleSignIn: jest
        .fn()
        .mockRejectedValue(new InviteRequiredException()),
      frontendUrl: jest.fn().mockReturnValue('http://localhost:5173'),
    };
    const controller = new AuthController(authService as never);
    const result = response();

    await controller.callback({} as never, result as never, 'code', 'state');

    expect(result.redirect).toHaveBeenCalledWith(
      'http://localhost:5173/sign-in?error=invite_required',
    );
  });

  it('does not mislabel server or migration failures as invitations', async () => {
    const authService = {
      finishGoogleSignIn: jest
        .fn()
        .mockRejectedValue(new Error('database unavailable')),
      frontendUrl: jest.fn().mockReturnValue('http://localhost:5173'),
    };
    const controller = new AuthController(authService as never);
    const result = response();
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await controller.callback({} as never, result as never, 'code', 'state');

    expect(result.redirect).toHaveBeenCalledWith(
      'http://localhost:5173/sign-in?error=sign_in_failed',
    );
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
