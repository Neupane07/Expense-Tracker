import { Global, Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionAuthGuard, AdminGuard],
  exports: [AuthService, SessionAuthGuard, AdminGuard],
})
export class AuthModule {}
