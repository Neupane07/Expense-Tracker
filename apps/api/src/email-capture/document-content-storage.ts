import { Prisma } from '../generated/prisma/client';
import { ExpenseCryptoService } from '../expense-core/expense-crypto.service';

// The intake pipeline depends on this boundary; persistence can move out of
// PostgreSQL later without changing parsing or reconciliation.
export interface DocumentContentStorage {
  retain(
    tx: Prisma.TransactionClient,
    documentId: string,
    bytes: Buffer,
  ): Promise<void>;
  load(encryptedBytes: Uint8Array): Buffer;
  remove(tx: Prisma.TransactionClient, documentId: string): Promise<void>;
}

export class PostgresDocumentContentStorage implements DocumentContentStorage {
  constructor(private readonly crypto: ExpenseCryptoService) {}
  async retain(
    tx: Prisma.TransactionClient,
    documentId: string,
    bytes: Buffer,
  ) {
    await tx.sourceDocument.update({
      where: { id: documentId },
      data: { encryptedBytes: Buffer.from(this.crypto.encrypt(bytes)) },
    });
  }
  load(encryptedBytes: Uint8Array) {
    return this.crypto.decrypt(Buffer.from(encryptedBytes).toString());
  }
  async remove(tx: Prisma.TransactionClient, documentId: string) {
    await tx.sourceDocument.update({
      where: { id: documentId },
      data: { encryptedBytes: null },
    });
  }
}
