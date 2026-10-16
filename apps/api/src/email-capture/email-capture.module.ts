import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExpenseCoreModule } from '../expense-core/expense-core.module';
import {
  EmailConnectionsController,
  SourceDocumentsController,
} from './email-capture.controller';
import { GmailService } from './gmail.service';
import { SourceDocumentsService } from './source-documents.service';
import { ExpenseJobsService } from './expense-jobs.service';
@Module({
  imports: [AuthModule, ExpenseCoreModule],
  controllers: [EmailConnectionsController, SourceDocumentsController],
  providers: [GmailService, SourceDocumentsService, ExpenseJobsService],
  exports: [ExpenseJobsService, SourceDocumentsService],
})
export class EmailCaptureModule {}
