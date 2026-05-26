/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { ForbiddenException } from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import { InviteRequiredException } from './auth.errors';
import { AuthService } from './auth.service';

const configValues: Record<string, string> = {
  AUTH_COOKIE_SECRET: 'cookie-secret-with-more-than-thirty-two-bytes',
  FRONTEND_URL: 'https://expense.example.com',
  GOOGLE_CALLBACK_URL: 'https://api.example.com/auth/google/callback',
  GOOGLE_CLIENT_ID: 'google-client',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  INITIAL_ADMIN_EMAIL: 'admin@example.com',
  NODE_ENV: 'production',
};

function buildService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    session: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    invitation: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    ...prismaOverrides,
  };
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  };

  return {
    prisma,
    service: new AuthService(prisma as never, config as never),
  };
}

describe('AuthService', () => {
  it('rejects an unverified Google identity before invitation admission', async () => {
    const { service } = buildService();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id_token: 'id-token' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          aud: 'google-client',
          iss: 'https://accounts.google.com',
          sub: 'google-subject',
          email: 'member@example.com',
          email_verified: 'false',
        }),
      } as never);

    await expect(
      (
        service as never as {
          exchangeGoogleIdentity: (
            code: string,
            verifier: string,
          ) => Promise<unknown>;
        }
      ).exchangeGoogleIdentity('code', 'verifier'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    fetchMock.mockRestore();
  });

  it('does not admit a verified Google email without an invitation', async () => {
    const transaction = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      invitation: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const { service } = buildService({
      $transaction: jest.fn((callback) => callback(transaction)),
    });

    await expect(
      (
        service as never as {
          findOrCreateEligibleUser: (identity: unknown) => Promise<unknown>;
        }
      ).findOrCreateEligibleUser({
        subject: 'google-subject',
        email: 'outside@example.com',
        name: null,
        avatarUrl: null,
      }),
    ).rejects.toBeInstanceOf(InviteRequiredException);
  });

  it('creates an invited member and consumes the one-time invitation', async () => {
    const user = {
      id: 'member-a',
      email: 'member@example.com',
      name: 'Member',
      avatarUrl: null,
      role: Role.MEMBER,
    };
    const transaction = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(user),
      },
      invitation: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'invite-a', role: Role.MEMBER }),
        update: jest.fn(),
      },
      account: { createMany: jest.fn() },
      rule: { createMany: jest.fn() },
    };
    const { service } = buildService({
      $transaction: jest.fn((callback) => callback(transaction)),
    });

    await expect(
      (
        service as never as {
          findOrCreateEligibleUser: (identity: unknown) => Promise<unknown>;
        }
      ).findOrCreateEligibleUser({
        subject: 'google-subject',
        email: 'member@example.com',
        name: 'Member',
        avatarUrl: null,
      }),
    ).resolves.toEqual(user);
    expect(transaction.invitation.update).toHaveBeenCalledWith({
      where: { id: 'invite-a' },
      data: { acceptedById: 'member-a', usedAt: expect.any(Date) },
    });
    expect(transaction.account.createMany).toHaveBeenCalled();
    expect(transaction.rule.createMany).toHaveBeenCalled();
  });

  it('does not create duplicate defaults for an initial admin with quarantined legacy data', async () => {
    const user = {
      id: 'admin-a',
      email: 'admin@example.com',
      name: 'Admin',
      avatarUrl: null,
      role: Role.ADMIN,
    };
    const transaction = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(user),
      },
      account: {
        count: jest.fn().mockResolvedValue(2),
        createMany: jest.fn(),
      },
      rule: {
        count: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const { service } = buildService({
      $transaction: jest.fn((callback) => callback(transaction)),
    });

    await (
      service as never as {
        findOrCreateEligibleUser: (identity: unknown) => Promise<unknown>;
      }
    ).findOrCreateEligibleUser({
      subject: 'admin-subject',
      email: 'admin@example.com',
      name: 'Admin',
      avatarUrl: null,
    });

    expect(transaction.account.createMany).not.toHaveBeenCalled();
    expect(transaction.rule.createMany).not.toHaveBeenCalled();
  });

  it('sets a secure HttpOnly session cookie after eligible Google sign-in', async () => {
    const user = {
      id: 'admin-a',
      email: 'admin@example.com',
      name: 'Admin',
      avatarUrl: null,
      role: Role.ADMIN,
    };
    const { prisma, service } = buildService();
    const internal = service as never as {
      validateOAuthCookie: () => string;
      exchangeGoogleIdentity: () => Promise<unknown>;
      findOrCreateEligibleUser: () => Promise<typeof user>;
    };
    internal.validateOAuthCookie = jest.fn().mockReturnValue('verifier');
    internal.exchangeGoogleIdentity = jest.fn().mockResolvedValue({});
    internal.findOrCreateEligibleUser = jest.fn().mockResolvedValue(user);
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    await service.finishGoogleSignIn(
      { headers: {} } as never,
      response as never,
      'code',
      'state',
    );

    expect(prisma.session.create).toHaveBeenCalled();
    expect(response.cookie).toHaveBeenCalledWith(
      'expense_session',
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      }),
    );
  });

  it('deletes the persisted session and clears its cookie on sign-out', async () => {
    const { prisma, service } = buildService();
    const response = { clearCookie: jest.fn() };

    await service.signOut(
      { headers: { cookie: 'expense_session=opaque-token' } } as never,
      response as never,
    );

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String) },
    });
    expect(response.clearCookie).toHaveBeenCalledWith(
      'expense_session',
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
  });

  it('rejects invitation creation when invoked by a member', async () => {
    const { service } = buildService();

    await expect(
      service.createInvitation(
        {
          id: 'member-a',
          email: 'member@example.com',
          name: null,
          avatarUrl: null,
          role: Role.MEMBER,
        },
        { email: 'other@example.com' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
