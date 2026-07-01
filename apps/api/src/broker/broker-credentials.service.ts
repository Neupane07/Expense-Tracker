import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { z } from 'zod';
import { BrokerProvider } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CREDENTIAL_KEY_ENV = 'FINANCE_OS_CREDENTIAL_KEY';
type DhanCredentialType =
  | 'API_KEY'
  | 'API_SECRET'
  | 'CLIENT_ID'
  | 'ACCESS_TOKEN';

const dhanAppCredentialsSchema = z.object({
  apiKey: z.string().trim().min(1, 'apiKey is required').max(512),
  apiSecret: z.string().trim().min(1, 'apiSecret is required').max(1024),
  clientId: z.string().trim().min(1, 'clientId is required').max(128),
});

const dhanCredentialsSchema = dhanAppCredentialsSchema.extend({
  accessToken: z.string().trim().min(1).max(4096).optional().nullable(),
  accessTokenExpiresAt: z.string().datetime().optional().nullable(),
});

export type SaveDhanAppCredentialsInput = z.input<
  typeof dhanAppCredentialsSchema
>;
export type SaveDhanCredentialsInput = z.input<typeof dhanCredentialsSchema>;

export type DhanStoredCredentials = {
  apiKey: string;
  apiSecret: string;
  clientId: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
};

type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

@Injectable()
export class BrokerCredentialsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.getEncryptionKey();
  }

  async getDhanConnection(userId: string) {
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: BrokerProvider.DHAN,
        },
      },
      include: { credentials: true },
    });

    if (!connection) {
      return {
        brokerName: 'Dhan',
        provider: BrokerProvider.DHAN,
        connected: false,
        status: 'DISCONNECTED',
        hasApiKey: false,
        hasApiSecret: false,
        hasAccessToken: false,
        clientIdMasked: null,
        apiKeyMasked: null,
        accessTokenExpiresAt: null,
        accessTokenExpired: false,
        reconnectRequired: true,
        lastValidatedAt: null,
        lastSyncAt: null,
        metadata: null,
      };
    }

    const credentialTypes = new Set(
      connection.credentials.map((credential) => credential.credentialType),
    );

    return {
      id: connection.id,
      brokerName: connection.brokerName,
      provider: connection.provider,
      connected: true,
      status: connection.status,
      hasApiKey: credentialTypes.has('API_KEY'),
      hasApiSecret: credentialTypes.has('API_SECRET'),
      hasAccessToken: credentialTypes.has('ACCESS_TOKEN'),
      clientIdMasked: connection.clientIdMasked,
      apiKeyMasked: connection.apiKeyMasked,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      accessTokenExpired: this.isAccessTokenExpired(
        connection.accessTokenExpiresAt,
      ),
      reconnectRequired: this.isReconnectRequired(connection),
      lastValidatedAt: connection.lastValidatedAt,
      lastSyncAt: connection.lastSyncAt,
      metadata: connection.metadata,
    };
  }

  async saveDhanAppCredentials(
    userId: string,
    input: SaveDhanAppCredentialsInput,
  ) {
    const parsed = dhanAppCredentialsSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const data = parsed.data;
    const connection = await this.prisma.brokerConnection.upsert({
      where: {
        userId_provider: {
          userId,
          provider: BrokerProvider.DHAN,
        },
      },
      create: {
        userId,
        provider: BrokerProvider.DHAN,
        brokerName: 'Dhan',
        displayName: `Dhan ${this.maskSecret(data.clientId)}`,
        clientIdMasked: this.maskSecret(data.clientId),
        apiKeyMasked: this.maskSecret(data.apiKey),
        metadata: {
          readOnly: true,
          credentialVersion: 'v2',
          authFlow: 'oauth',
        },
        status: 'TOKEN_MISSING',
      },
      update: {
        brokerName: 'Dhan',
        displayName: `Dhan ${this.maskSecret(data.clientId)}`,
        clientIdMasked: this.maskSecret(data.clientId),
        apiKeyMasked: this.maskSecret(data.apiKey),
        metadata: {
          readOnly: true,
          credentialVersion: 'v2',
          authFlow: 'oauth',
        },
        status: 'TOKEN_MISSING',
      },
    });

    await this.upsertCredential(connection.id, userId, 'API_KEY', data.apiKey);
    await this.upsertCredential(
      connection.id,
      userId,
      'API_SECRET',
      data.apiSecret,
    );
    await this.upsertCredential(
      connection.id,
      userId,
      'CLIENT_ID',
      data.clientId,
    );

    return this.getDhanConnection(userId);
  }

  async saveDhanAccessToken(
    userId: string,
    input: {
      accessToken: string;
      accessTokenExpiresAt: Date;
      clientId?: string;
    },
  ) {
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: BrokerProvider.DHAN,
        },
      },
    });

    if (!connection) {
      throw new BadRequestException('Dhan credentials are not configured.');
    }

    await this.prisma.brokerConnection.update({
      where: { id: connection.id },
      data: {
        status: 'CONFIGURED',
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        clientIdMasked: input.clientId
          ? this.maskSecret(input.clientId)
          : connection.clientIdMasked,
        metadata: {
          readOnly: true,
          credentialVersion: 'v2',
          authFlow: 'oauth',
          lastTokenIssuedAt: new Date().toISOString(),
        },
      },
    });

    if (input.clientId) {
      await this.upsertCredential(
        connection.id,
        userId,
        'CLIENT_ID',
        input.clientId,
      );
    }

    await this.upsertCredential(
      connection.id,
      userId,
      'ACCESS_TOKEN',
      input.accessToken,
    );

    return this.getDhanConnection(userId);
  }

  async saveDhanCredentials(userId: string, input: SaveDhanCredentialsInput) {
    const parsed = dhanCredentialsSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const data = parsed.data;
    const accessTokenExpiresAt = data.accessTokenExpiresAt
      ? new Date(data.accessTokenExpiresAt)
      : null;
    const connection = await this.prisma.brokerConnection.upsert({
      where: {
        userId_provider: {
          userId,
          provider: BrokerProvider.DHAN,
        },
      },
      create: {
        userId,
        provider: BrokerProvider.DHAN,
        brokerName: 'Dhan',
        displayName: `Dhan ${this.maskSecret(data.clientId)}`,
        clientIdMasked: this.maskSecret(data.clientId),
        apiKeyMasked: this.maskSecret(data.apiKey),
        accessTokenExpiresAt,
        metadata: {
          readOnly: true,
          credentialVersion: 'v1',
        },
        status: data.accessToken ? 'CONFIGURED' : 'TOKEN_MISSING',
      },
      update: {
        brokerName: 'Dhan',
        displayName: `Dhan ${this.maskSecret(data.clientId)}`,
        clientIdMasked: this.maskSecret(data.clientId),
        apiKeyMasked: this.maskSecret(data.apiKey),
        accessTokenExpiresAt,
        metadata: {
          readOnly: true,
          credentialVersion: 'v1',
        },
        status: data.accessToken ? 'CONFIGURED' : 'TOKEN_MISSING',
      },
    });

    await this.upsertCredential(connection.id, userId, 'API_KEY', data.apiKey);
    await this.upsertCredential(
      connection.id,
      userId,
      'API_SECRET',
      data.apiSecret,
    );
    await this.upsertCredential(
      connection.id,
      userId,
      'CLIENT_ID',
      data.clientId,
    );

    if (data.accessToken) {
      await this.upsertCredential(
        connection.id,
        userId,
        'ACCESS_TOKEN',
        data.accessToken,
      );
    }

    return this.getDhanConnection(userId);
  }

  async deleteDhanCredentials(userId: string) {
    await this.prisma.brokerConnection.deleteMany({
      where: {
        userId,
        provider: BrokerProvider.DHAN,
      },
    });

    return { deleted: true };
  }

  async getDhanCredentials(userId: string): Promise<DhanStoredCredentials> {
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: BrokerProvider.DHAN,
        },
      },
      include: { credentials: true },
    });

    if (!connection) {
      throw new BadRequestException('Dhan credentials are not configured.');
    }

    const values = new Map(
      connection.credentials.map((credential) => [
        credential.credentialType,
        this.decrypt({
          ciphertext: credential.ciphertext,
          iv: credential.iv,
          authTag: credential.authTag,
        }),
      ]),
    );

    const apiKey = values.get('API_KEY');
    const apiSecret = values.get('API_SECRET');
    const clientId = values.get('CLIENT_ID');

    if (!apiKey || !apiSecret || !clientId) {
      throw new BadRequestException('Dhan credentials are incomplete.');
    }

    return {
      apiKey,
      apiSecret,
      clientId,
      accessToken: values.get('ACCESS_TOKEN') ?? null,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
    };
  }

  async markDhanValidated(userId: string) {
    await this.prisma.brokerConnection.update({
      where: {
        userId_provider: {
          userId,
          provider: BrokerProvider.DHAN,
        },
      },
      data: {
        status: 'VALIDATED',
        lastValidatedAt: new Date(),
      },
    });

    return this.getDhanConnection(userId);
  }

  async markDhanSynced(userId: string) {
    await this.prisma.brokerConnection.update({
      where: {
        userId_provider: {
          userId,
          provider: BrokerProvider.DHAN,
        },
      },
      data: {
        lastSyncAt: new Date(),
      },
    });
  }

  encrypt(plaintext: string): EncryptedPayload {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload) {
    const key = this.getEncryptionKey();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private async upsertCredential(
    brokerConnectionId: string,
    userId: string,
    credentialType: DhanCredentialType,
    plaintext: string,
  ) {
    const encrypted = this.encrypt(plaintext);

    await this.prisma.brokerCredential.upsert({
      where: {
        brokerConnectionId_credentialType: {
          brokerConnectionId,
          credentialType,
        },
      },
      create: {
        userId,
        brokerConnectionId,
        credentialType,
        ...encrypted,
      },
      update: encrypted,
    });
  }

  private getEncryptionKey() {
    const rawKey = this.configService.get<string>(CREDENTIAL_KEY_ENV)?.trim();

    if (!rawKey) {
      throw new ServiceUnavailableException(
        `${CREDENTIAL_KEY_ENV} is required for broker credential storage.`,
      );
    }

    if (/^[a-f0-9]{64}$/i.test(rawKey)) {
      return Buffer.from(rawKey, 'hex');
    }

    const base64 = Buffer.from(rawKey, 'base64');
    if (base64.length === 32 && base64.toString('base64') === rawKey) {
      return base64;
    }

    if (Buffer.byteLength(rawKey, 'utf8') < 32) {
      throw new ServiceUnavailableException(
        `${CREDENTIAL_KEY_ENV} must be at least 32 bytes, 32-byte base64, or 64-character hex.`,
      );
    }

    return createHash('sha256').update(rawKey).digest();
  }

  private maskSecret(value: string) {
    const normalized = value.trim();
    const suffix = normalized.slice(-4);
    return suffix ? `****${suffix}` : '****';
  }

  private isAccessTokenExpired(expiresAt: Date | null) {
    if (!expiresAt) {
      return false;
    }

    return expiresAt.getTime() <= Date.now();
  }

  private isReconnectRequired(connection: {
    status: string;
    accessTokenExpiresAt: Date | null;
    credentials?: Array<{ credentialType: string }>;
  }) {
    const credentialTypes = new Set(
      connection.credentials?.map((credential) => credential.credentialType) ??
        [],
    );

    if (!credentialTypes.has('ACCESS_TOKEN')) {
      return true;
    }

    if (connection.status === 'TOKEN_MISSING') {
      return true;
    }

    return this.isAccessTokenExpired(connection.accessTokenExpiresAt);
  }
}
