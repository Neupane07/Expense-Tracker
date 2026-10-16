import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseCryptoService } from '../expense-core/expense-crypto.service';
import { dateString, parseInput } from '../expense-core/expense-validation';
import { SourceDocumentsService } from './source-documents.service';

const scope = 'https://www.googleapis.com/auth/gmail.readonly';
const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  payload: GmailPart & { headers?: { name: string; value: string }[] };
};
export class GmailError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
@Injectable()
export class GmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: ExpenseCryptoService,
    private readonly documents: SourceDocumentsService,
  ) {}
  enabled() {
    return this.config.get('EXPENSE_GMAIL_ENABLED') === 'true';
  }
  private required(key: string) {
    const value = this.config.get<string>(key);
    if (!value)
      throw new ServiceUnavailableException(`${key} is not configured`);
    return value;
  }
  async allowed(userId: string) {
    if (!this.enabled())
      throw new ServiceUnavailableException('Gmail capture is disabled');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      (this.config.get('EXPENSE_GMAIL_PILOT_ONLY') !== 'false' &&
        user.email !==
          this.config.get<string>('INITIAL_ADMIN_EMAIL')?.toLowerCase())
    )
      throw new ForbiddenException(
        'Gmail pilot is limited to the initial administrator',
      );
  }
  async list(userId: string) {
    const connections = await this.prisma.emailConnection.findMany({
      where: { userId },
      omit: { refreshToken: true, googleSubject: true },
      include: {
        _count: {
          select: {
            jobs: { where: { status: { in: ['PENDING', 'RUNNING'] } } },
            documents: {
              where: {
                status: { in: ['FAILED', 'UNSUPPORTED', 'PASSWORD_REQUIRED'] },
              },
            },
          },
        },
      },
    });
    return { enabled: this.enabled(), connections };
  }
  async start(userId: string) {
    await this.allowed(userId);
    const state = randomBytes(32).toString('base64url'),
      verifier = randomBytes(32).toString('base64url');
    await this.prisma.emailOAuthState.create({
      data: {
        id: createHash('sha256').update(state).digest('hex'),
        userId,
        verifier: this.crypto.encrypt(verifier, 'TOKEN'),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: this.required('EXPENSE_GOOGLE_CLIENT_ID'),
      redirect_uri: this.required('EXPENSE_GOOGLE_CALLBACK_URL'),
      response_type: 'code',
      scope: `${scope} openid email`,
      access_type: 'offline',
      prompt: 'consent select_account',
      state,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    }).toString();
    return { url: url.toString() };
  }
  async callback(userId: string, code: string, state: string) {
    await this.allowed(userId);
    if (!code || !state)
      throw new BadRequestException('Missing OAuth response');
    const stateId = createHash('sha256').update(state).digest('hex');
    const pending = await this.prisma.$transaction(async (tx) => {
      const row = await tx.emailOAuthState.findFirst({
        where: { id: stateId, userId, expiresAt: { gt: new Date() } },
      });
      if (!row) throw new ForbiddenException('Expired or invalid OAuth state');
      await tx.emailOAuthState.delete({ where: { id: row.id } });
      return row;
    });
    const tokens = tokenSchema.parse(
      await this.tokenRequest({
        code,
        code_verifier: this.crypto
          .decrypt(pending.verifier, 'TOKEN')
          .toString(),
        grant_type: 'authorization_code',
        redirect_uri: this.required('EXPENSE_GOOGLE_CALLBACK_URL'),
      }),
    );
    if (!tokens.refresh_token || !tokens.scope?.split(' ').includes(scope))
      throw new BadRequestException(
        'Offline Gmail read-only permission is required',
      );
    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!profileResponse.ok) throw new GmailError('PROFILE_FAILED');
    const profile = z
      .object({
        sub: z.string(),
        email: z.email(),
        email_verified: z.literal(true),
      })
      .parse(await profileResponse.json());
    const connection = await this.prisma.emailConnection.upsert({
      where: { userId_googleSubject: { userId, googleSubject: profile.sub } },
      create: {
        userId,
        googleSubject: profile.sub,
        email: profile.email,
        refreshToken: this.crypto.encrypt(tokens.refresh_token, 'TOKEN'),
      },
      update: {
        email: profile.email,
        refreshToken: this.crypto.encrypt(tokens.refresh_token, 'TOKEN'),
        status: 'PREVIEW',
        generation: { increment: 1 },
        errorCode: null,
      },
    });
    return { id: connection.id };
  }
  private async tokenRequest(parameters: Record<string, string>) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: this.required('EXPENSE_GOOGLE_CLIENT_ID'),
        client_secret: this.required('EXPENSE_GOOGLE_CLIENT_SECRET'),
        ...parameters,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new GmailError(
        response.status === 400 ? 'RECONNECT_REQUIRED' : 'TOKEN_UNAVAILABLE',
      );
    return response.json() as Promise<unknown>;
  }
  async accessToken(id: string, userId: string) {
    const connection = await this.owned(userId, id);
    if (!connection.refreshToken) throw new GmailError('RECONNECT_REQUIRED');
    const token = tokenSchema.parse(
      await this.tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: this.crypto
          .decrypt(connection.refreshToken, 'TOKEN')
          .toString(),
      }),
    );
    return token.access_token;
  }
  async owned(userId: string, id: string) {
    const connection = await this.prisma.emailConnection.findFirst({
      where: { id, userId },
    });
    if (!connection) throw new NotFoundException('Connection not found');
    return connection;
  }
  async action(userId: string, id: string, input: unknown) {
    const { action } = parseInput(
      z
        .object({ action: z.enum(['activate', 'pause', 'disconnect']) })
        .strict(),
      input,
    );
    const connection = await this.owned(userId, id);
    if (action === 'activate') {
      await this.allowed(userId);
      if (!connection.refreshToken)
        throw new BadRequestException('Reconnect Gmail first');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "EmailConnection" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
      const current = await tx.emailConnection.findFirst({
        where: { id, userId },
      });
      if (!current || current.generation !== connection.generation)
        throw new ConflictException(
          'Connection changed; refresh and try again',
        );
      const resume =
        action === 'activate'
          ? await tx.expenseJob.findMany({
              where: {
                userId,
                connectionId: id,
                generation:
                  connection.status === 'PAUSED'
                    ? connection.generation - 1
                    : connection.generation,
                status: {
                  in:
                    connection.status === 'PAUSED'
                      ? ['CANCELLED']
                      : ['PENDING', 'RUNNING'],
                },
              },
            })
          : [];
      await tx.emailConnection.update({
        where: { id, userId },
        data: {
          status:
            action === 'activate'
              ? 'ACTIVE'
              : action === 'pause'
                ? 'PAUSED'
                : 'DISCONNECTED',
          generation: { increment: 1 },
          nextPollAt: new Date(),
          ...(action === 'disconnect' ? { refreshToken: null } : {}),
        },
      });
      await tx.expenseJob.updateMany({
        where: {
          connectionId: id,
          userId,
          status: { in: ['PENDING', 'RUNNING'] },
        },
        data: { status: 'CANCELLED', leaseToken: null },
      });
      if (resume.length)
        await tx.expenseJob.createMany({
          data: resume.map((job) => ({
            userId,
            connectionId: id,
            generation: connection.generation + 1,
            kind: job.kind,
            from: job.from,
            to: job.to,
            pageToken: job.pageToken,
          })),
        });
    });
    if (action === 'disconnect' && connection.refreshToken) {
      try {
        const response = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          body: new URLSearchParams({
            token: this.crypto
              .decrypt(connection.refreshToken, 'TOKEN')
              .toString(),
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          return {
            status: 'DISCONNECTED',
            warning:
              'Local access removed. Revoke the app in Google Account permissions as well.',
          };
      } catch {
        return {
          status: 'DISCONNECTED',
          warning:
            'Local access removed. Revoke the app in Google Account permissions as well.',
        };
      }
    }
    if (action === 'activate') {
      const ready = await this.prisma.sourceDocument.findMany({
        where: { userId, connectionId: id, status: 'READY', deletedAt: null },
        select: { id: true },
      });
      for (const doc of ready) await this.documents.post(userId, doc.id, true);
    }
    return { status: action };
  }
  async backfill(userId: string, id: string, input: unknown) {
    await this.allowed(userId);
    const c = await this.owned(userId, id);
    if (!['PREVIEW', 'ACTIVE'].includes(c.status))
      throw new BadRequestException('Resume or reconnect first');
    const data = parseInput(
      z
        .object({
          from: dateString.optional(),
          to: dateString.optional(),
          allHistory: z.boolean().default(false),
        })
        .strict()
        .refine(
          (x) => !(x.from && x.allHistory),
          'Choose a start date or all history',
        ),
      input,
    );
    const end = data.to
      ? new Date(new Date(data.to).getTime() + 86400000)
      : new Date();
    const start = data.allHistory
      ? new Date('2004-04-01')
      : data.from
        ? new Date(data.from)
        : new Date(end.getTime() - 90 * 86400000);
    if (
      start >= end ||
      start < new Date('2004-04-01') ||
      end > new Date(Date.now() + 86400000)
    )
      throw new BadRequestException('Invalid backfill range');
    const ranges: { from: Date; to: Date }[] = [];
    let cursor = start;
    while (cursor < end) {
      const next = new Date(
        Math.min(
          end.getTime(),
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
        ),
      );
      ranges.push({ from: cursor, to: next });
      cursor = next;
    }
    await this.prisma.expenseJob.createMany({
      data: ranges.reverse().map((range) => ({
        userId,
        connectionId: id,
        generation: c.generation,
        kind: 'BACKFILL',
        ...range,
      })),
    });
    return { queuedMonths: ranges.length };
  }
  async collect(job: {
    userId: string;
    connectionId: string;
    generation: number;
    from: Date;
    to: Date;
    pageToken: string | null;
  }) {
    const connection = await this.owned(job.userId, job.connectionId);
    if (
      connection.generation !== job.generation ||
      !['PREVIEW', 'ACTIVE'].includes(connection.status)
    )
      throw new GmailError('CANCELLED');
    const token = await this.accessToken(job.connectionId, job.userId);
    // Versioned allowlist. Unknown senders require a parser/template change, never a user-supplied arbitrary query.
    const q = `{from:alerts@icicibank.com from:credit_cards@icicibank.com from:customercare@icicibank.com} {subject:transaction subject:statement subject:spent subject:debited subject:credited} after:${Math.floor(job.from.getTime() / 1000)} before:${Math.ceil(job.to.getTime() / 1000)}`;
    const params = new URLSearchParams({
      q,
      maxResults: '50',
      includeSpamTrash: 'false',
      ...(job.pageToken ? { pageToken: job.pageToken } : {}),
    });
    const page = await this.get<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(token, `messages?${params}`);
    for (const item of page.messages ?? []) {
      const message = await this.get<GmailMessage>(
        token,
        `messages/${encodeURIComponent(item.id)}?format=full`,
      );
      const headers = message.payload.headers ?? [];
      const header = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name)?.value ?? '';
      const from = header('from')
        .match(/<?([\w.+-]+@icicibank\.com)>?\s*$/i)?.[1]
        ?.toLowerCase();
      if (
        !from ||
        ![
          'alerts@icicibank.com',
          'credit_cards@icicibank.com',
          'customercare@icicibank.com',
        ].includes(from)
      )
        continue;
      // Use only receiver-provided Authentication-Results; unverified mail stays outside the financial pipeline.
      const authentication = headers
        .filter((h) => h.name.toLowerCase() === 'authentication-results')
        .map((h) => h.value)
        .find((v) => /^mx\.google\.com;/i.test(v));
      if (
        !authentication ||
        !/dmarc=pass\b/i.test(authentication) ||
        !/header\.from=icicibank\.com\b/i.test(authentication)
      )
        continue;
      const parts: GmailPart[] = [];
      const walk = (p: GmailPart) => {
        parts.push(p);
        (p.parts ?? []).forEach(walk);
      };
      walk(message.payload);
      const plain = parts
        .filter((p) => p.mimeType === 'text/plain')
        .map((p) => Buffer.from(p.body?.data ?? '', 'base64url').toString())
        .join('\n');
      const html = parts
        .filter((p) => p.mimeType === 'text/html')
        .map((p) => Buffer.from(p.body?.data ?? '', 'base64url').toString())
        .join('\n');
      const text =
        plain ||
        html
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&');
      const subject = header('subject');
      const pdfs = parts.filter(
        (p) =>
          p.mimeType === 'application/pdf' &&
          p.body &&
          (p.body.attachmentId || p.body.data),
      );
      if (pdfs.length && /statement/i.test(subject)) {
        for (let index = 0; index < pdfs.length; index++) {
          const part = pdfs[index];
          if ((part.body?.size ?? 0) > 15 * 1024 * 1024) {
            await this.documents.recordRejected({
              userId: job.userId,
              connectionId: job.connectionId,
              generation: job.generation,
              sourceKey: `gmail:${connection.googleSubject}:${item.id}:pdf:${index}`,
              fileName: part.filename ?? 'statement.pdf',
              errorCode: 'DOCUMENT_TOO_LARGE',
            });
            continue;
          }
          const attachment = part.body?.data
            ? { data: part.body.data }
            : await this.get<{ data: string }>(
                token,
                `messages/${item.id}/attachments/${part.body!.attachmentId}`,
              );
          await this.documents.ingest({
            userId: job.userId,
            connectionId: job.connectionId,
            generation: job.generation,
            sourceKey: `gmail:${connection.googleSubject}:${item.id}:pdf:${index}`,
            bytes: Buffer.from(attachment.data, 'base64url'),
            kind: 'STATEMENT',
            fileName: part.filename ?? 'statement.pdf',
            mimeType: 'application/pdf',
            metadata: {
              from,
              subject,
              messageId: item.id,
              authentication,
              queryVersion: 'icici-v1',
            },
          });
        }
      } else {
        if (
          /\b(?:OTP|one.time password|declined|unsuccessful|payment request|due date|minimum amount due)\b/i.test(
            `${subject}\n${text}`,
          )
        )
          continue;
        if (/statement/i.test(subject)) {
          await this.documents.recordRejected({
            userId: job.userId,
            connectionId: job.connectionId,
            generation: job.generation,
            sourceKey: `gmail:${connection.googleSubject}:${item.id}:missing-pdf`,
            fileName: 'Statement attachment unavailable',
            errorCode: 'NO_SUPPORTED_ATTACHMENT',
          });
          continue;
        }
        if (!/\b(?:transaction|spent|debited|credited)\b/i.test(subject))
          continue;
        await this.documents.ingest({
          userId: job.userId,
          connectionId: job.connectionId,
          generation: job.generation,
          sourceKey: `gmail:${connection.googleSubject}:${item.id}`,
          bytes: Buffer.from(JSON.stringify({ text, message })),
          kind: 'ALERT',
          fileName: 'transaction-email.json',
          mimeType: 'application/json',
          metadata: {
            from,
            subject,
            messageId: item.id,
            queryVersion: 'icici-v1',
          },
        });
      }
    }
    return page.nextPageToken ?? null;
  }
  private async get<T>(token: string, path: string): Promise<T> {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new GmailError(
        response.status === 401
          ? 'RECONNECT_REQUIRED'
          : response.status === 429
            ? 'RATE_LIMITED'
            : response.status === 400 && path.includes('pageToken=')
              ? 'INVALID_PAGE_TOKEN'
              : 'GMAIL_UNAVAILABLE',
      );
    return response.json() as Promise<T>;
  }
}
