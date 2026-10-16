import { ConfigService } from '@nestjs/config';
import { ExpenseCryptoService } from './expense-crypto.service';
describe('expense encryption', () => {
  const crypto = new ExpenseCryptoService(
    new ConfigService({
      EXPENSE_DATA_KEY: '11'.repeat(32),
      EXPENSE_TOKEN_KEY: '22'.repeat(32),
    }),
  );
  it('round-trips binary data without leaking plaintext and authenticates ciphertext', () => {
    const source = Buffer.from([0, 255, 100, 11]);
    const encrypted = crypto.encrypt(source);
    expect(crypto.decrypt(encrypted)).toEqual(source);
    expect(() => crypto.decrypt(encrypted, 'TOKEN')).toThrow();
    expect(crypto.encrypt(source)).not.toEqual(encrypted);
  });
  it('fails closed without configured keys', () =>
    expect(() =>
      new ExpenseCryptoService(new ConfigService({})).encrypt('secret'),
    ).toThrow());
});
