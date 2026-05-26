import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InviteRequiredException } from './auth.errors';
import type { AuthenticatedUser } from './auth.types';
import { defaultAccounts, defaultRules } from './default-financial-data';

type GoogleIdentity = {
  subject: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

type GoogleTokenResponse = {
  id_token?: string;
};

type GoogleTokenInfo = {
  sub?: string;
  aud?: string;
  iss?: string;
  email?: string;
  email_verified?: string;
  name?: string;
  picture?: string;
};

const SESSION_COOKIE_DEFAULT = 'expense_session';
const OAUTH_COOKIE = 'expense_oauth';
const LEGACY_OWNER_ID = 'legacy_unassigned_owner';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  startGoogleSignIn(response: Response) {
    const clientId = this.requiredAuthConfig('GOOGLE_CLIENT_ID');
    const redirectUri = this.googleRedirectUri();
    const state = this.randomToken();
    const verifier = this.randomToken();
    const challenge = this.hash(verifier);
    const payload = `${state}.${verifier}`;
    const signedPayload = `${payload}.${this.sign(payload)}`;

    response.cookie(OAUTH_COOKIE, signedPayload, {
      ...this.baseCookieOptions(),
      maxAge: 10 * 60 * 1000,
      path: '/auth/google/callback',
    });

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    response.redirect(url.toString());
  }

  async finishGoogleSignIn(
    request: Request,
    response: Response,
    code: string | undefined,
    state: string | undefined,
  ) {
    if (!code || !state) {
      throw new BadRequestException(
        'Google did not return an authorization code.',
      );
    }

    const verifier = this.validateOAuthCookie(request, state);
    const identity = await this.exchangeGoogleIdentity(code, verifier);
    const user = await this.findOrCreateEligibleUser(identity);
    const sessionToken = this.randomToken();
    const maxAge = this.sessionMaxAgeMs();

    await this.prisma.session.create({
      data: {
        tokenHash: this.hash(sessionToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + maxAge),
      },
    });

    response.clearCookie(OAUTH_COOKIE, {
      ...this.baseCookieOptions(),
      path: '/auth/google/callback',
    });
    response.cookie(this.sessionCookieName(), sessionToken, {
      ...this.baseCookieOptions(),
      maxAge,
      path: '/',
    });

    return user;
  }

  async authenticateRequest(request: Request) {
    const token = this.readCookie(request, this.sessionCookieName());

    if (!token) {
      return null;
    }

    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: this.hash(token),
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!session || session.user.id === LEGACY_OWNER_ID) {
      return null;
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return this.toAuthenticatedUser(session.user);
  }

  async signOut(request: Request, response: Response) {
    const token = this.readCookie(request, this.sessionCookieName());

    if (token) {
      await this.prisma.session.deleteMany({
        where: { tokenHash: this.hash(token) },
      });
    }

    response.clearCookie(this.sessionCookieName(), {
      ...this.baseCookieOptions(),
      path: '/',
    });
  }

  findInvitations() {
    return this.prisma.invitation.findMany({
      include: {
        invitedBy: {
          select: {
            name: true,
            email: true,
          },
        },
        acceptedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createInvitation(
    admin: AuthenticatedUser,
    input: { email?: string; role?: string },
  ) {
    if (admin.role !== Role.ADMIN) {
      throw new ForbiddenException('Administrator access is required.');
    }

    const email = this.normalizeEmail(input.email);
    const role = input.role ? this.parseRole(input.role) : Role.MEMBER;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('This email already belongs to a user.');
    }

    return this.prisma.invitation.upsert({
      where: { email },
      create: {
        email,
        role,
        invitedById: admin.id,
      },
      update: {
        role,
        invitedById: admin.id,
        revokedAt: null,
      },
    });
  }

  async revokeInvitation(id: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
    });

    if (!invitation || invitation.usedAt) {
      throw new BadRequestException('Only unused invitations can be revoked.');
    }

    return this.prisma.invitation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  frontendUrl() {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  private async findOrCreateEligibleUser(identity: GoogleIdentity) {
    const initialAdminEmail = this.normalizeEmail(
      this.requiredAuthConfig('INITIAL_ADMIN_EMAIL'),
    );

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.user.findUnique({
        where: { email: identity.email },
      });

      if (current) {
        if (
          current.id === LEGACY_OWNER_ID ||
          (current.googleSubject && current.googleSubject !== identity.subject)
        ) {
          throw new ForbiddenException(
            'This Google identity is not authorized.',
          );
        }

        const user = await transaction.user.update({
          where: { id: current.id },
          data: {
            googleSubject: identity.subject,
            name: identity.name,
            avatarUrl: identity.avatarUrl,
            lastSignedInAt: new Date(),
          },
        });
        return this.toAuthenticatedUser(user);
      }

      const invitation =
        identity.email === initialAdminEmail
          ? null
          : await transaction.invitation.findFirst({
              where: {
                email: identity.email,
                usedAt: null,
                revokedAt: null,
              },
            });

      if (identity.email !== initialAdminEmail && !invitation) {
        throw new InviteRequiredException();
      }

      const user = await transaction.user.create({
        data: {
          googleSubject: identity.subject,
          email: identity.email,
          name: identity.name,
          avatarUrl: identity.avatarUrl,
          role:
            identity.email === initialAdminEmail
              ? Role.ADMIN
              : (invitation?.role ?? Role.MEMBER),
          lastSignedInAt: new Date(),
        },
      });

      if (invitation) {
        await transaction.invitation.update({
          where: { id: invitation.id },
          data: {
            acceptedById: user.id,
            usedAt: new Date(),
          },
        });
      }

      const hasQuarantinedLegacyData =
        identity.email === initialAdminEmail &&
        ((await transaction.account.count({
          where: { userId: LEGACY_OWNER_ID },
        })) > 0 ||
          (await transaction.rule.count({
            where: { userId: LEGACY_OWNER_ID },
          })) > 0);

      if (!hasQuarantinedLegacyData) {
        await transaction.account.createMany({
          data: defaultAccounts.map((account) => ({
            ...account,
            userId: user.id,
          })),
        });
        await transaction.rule.createMany({
          data: defaultRules.map((rule) => ({
            ...rule,
            userId: user.id,
          })),
        });
      }

      return this.toAuthenticatedUser(user);
    });
  }

  private async exchangeGoogleIdentity(code: string, verifier: string) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.requiredAuthConfig('GOOGLE_CLIENT_ID'),
        client_secret: this.requiredAuthConfig('GOOGLE_CLIENT_SECRET'),
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: this.googleRedirectUri(),
      }),
    });

    if (!response.ok) {
      throw new ForbiddenException('Google sign-in could not be verified.');
    }

    const tokens = (await response.json()) as GoogleTokenResponse;

    if (!tokens.id_token) {
      throw new ForbiddenException('Google did not provide an identity token.');
    }

    const verification = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`,
    );

    if (!verification.ok) {
      throw new ForbiddenException('Google identity validation failed.');
    }

    const profile = (await verification.json()) as GoogleTokenInfo;
    const validIssuer =
      profile.iss === 'accounts.google.com' ||
      profile.iss === 'https://accounts.google.com';

    if (
      profile.aud !== this.requiredAuthConfig('GOOGLE_CLIENT_ID') ||
      !validIssuer ||
      profile.email_verified !== 'true' ||
      !profile.sub ||
      !profile.email
    ) {
      throw new ForbiddenException('A verified Google email is required.');
    }

    return {
      subject: profile.sub,
      email: this.normalizeEmail(profile.email),
      name: profile.name?.trim() || null,
      avatarUrl: profile.picture?.trim() || null,
    };
  }

  private validateOAuthCookie(request: Request, state: string) {
    const cookie = this.readCookie(request, OAUTH_COOKIE);
    const parts = cookie?.split('.') ?? [];

    if (parts.length !== 3 || parts[0] !== state) {
      throw new ForbiddenException('Google sign-in state is invalid.');
    }

    const payload = `${parts[0]}.${parts[1]}`;
    const expectedSignature = this.sign(payload);

    if (!this.equalTokens(expectedSignature, parts[2])) {
      throw new ForbiddenException('Google sign-in state is invalid.');
    }

    return parts[1];
  }

  private parseRole(role: string) {
    if (Object.values(Role).includes(role as Role)) {
      return role as Role;
    }

    throw new BadRequestException(`Unsupported role: ${role}`);
  }

  private normalizeEmail(email: string | undefined) {
    const normalized = email?.trim().toLowerCase();

    if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new BadRequestException('A valid email address is required.');
    }

    return normalized;
  }

  private toAuthenticatedUser(user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  }

  private googleRedirectUri() {
    return (
      this.config.get<string>('GOOGLE_CALLBACK_URL') ??
      'http://localhost:3000/auth/google/callback'
    );
  }

  private sessionCookieName() {
    return (
      this.config.get<string>('SESSION_COOKIE_NAME') ?? SESSION_COOKIE_DEFAULT
    );
  }

  private sessionMaxAgeMs() {
    const configured = Number(
      this.config.get<string>('SESSION_MAX_AGE_DAYS') ?? 30,
    );
    const days =
      Number.isFinite(configured) && configured > 0 ? configured : 30;
    return days * 24 * 60 * 60 * 1000;
  }

  private baseCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get<string>('NODE_ENV') === 'production',
    };
  }

  private requiredAuthConfig(key: string) {
    const value = this.config.get<string>(key)?.trim();

    if (!value) {
      throw new ServiceUnavailableException(
        `${key} must be configured before sign-in can be used.`,
      );
    }

    return value;
  }

  private readCookie(request: Request, name: string) {
    const cookies = request.headers.cookie?.split(';') ?? [];

    for (const cookie of cookies) {
      const [cookieName, ...value] = cookie.trim().split('=');

      if (cookieName === name) {
        return decodeURIComponent(value.join('='));
      }
    }

    return undefined;
  }

  private randomToken() {
    return randomBytes(32).toString('base64url');
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('base64url');
  }

  private sign(value: string) {
    return createHmac('sha256', this.requiredAuthConfig('AUTH_COOKIE_SECRET'))
      .update(value)
      .digest('base64url');
  }

  private equalTokens(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
