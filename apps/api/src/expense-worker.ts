import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { EmailCaptureModule } from './email-capture/email-capture.module';
import { ExpenseJobsService } from './email-capture/expense-jobs.service';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EmailCaptureModule,
  ],
})
class WorkerModule {}
async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const jobs = app.get(ExpenseJobsService);
  while (!stopped) {
    try {
      await jobs.tick();
    } catch {
      process.stderr.write('Expense worker tick failed; retrying.\n');
    }
    if (!stopped) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  await app.close();
}
void main();
