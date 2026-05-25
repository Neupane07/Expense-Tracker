import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'expense-tracker-api',
      timestamp: new Date().toISOString(),
    };
  }
}
