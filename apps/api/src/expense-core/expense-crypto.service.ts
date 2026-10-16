import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class ExpenseCryptoService {
  constructor(private readonly config: ConfigService) {}
  private key(purpose: 'DATA' | 'TOKEN') {
    const value = this.config.get<string>(`EXPENSE_${purpose}_KEY`) ?? '';
    if (!/^[a-f\d]{64}$/i.test(value))
      throw new ServiceUnavailableException(
        `EXPENSE_${purpose}_KEY must be 64 hexadecimal characters`,
      );
    return Buffer.from(value, 'hex');
  }
  encrypt(data: Buffer | string, purpose: 'DATA' | 'TOKEN' = 'DATA'): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(purpose), iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }
  decrypt(value: string, purpose: 'DATA' | 'TOKEN' = 'DATA'): Buffer {
    const [version, iv, tag, bytes] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !bytes)
      throw new ServiceUnavailableException(
        'Invalid encrypted expense payload',
      );
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.key(purpose),
      Buffer.from(iv, 'base64'),
    );
    cipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      cipher.update(Buffer.from(bytes, 'base64')),
      cipher.final(),
    ]);
  }
}
