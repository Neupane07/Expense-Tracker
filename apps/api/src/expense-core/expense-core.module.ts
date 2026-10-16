import { Module } from '@nestjs/common';
import { ExpenseCryptoService } from './expense-crypto.service';
@Module({ providers: [ExpenseCryptoService], exports: [ExpenseCryptoService] })
export class ExpenseCoreModule {}
