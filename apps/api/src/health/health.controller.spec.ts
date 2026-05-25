import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('returns an ok health response', () => {
    expect(controller.getHealth()).toMatchObject({
      status: 'ok',
      service: 'expense-tracker-api',
    });
  });
});
