import { Test, TestingModule } from '@nestjs/testing';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { InternalToolsController } from './internal-tools.controller';
import { ToolAuditService } from './tool-audit.service';
import { ToolExecutorService } from './tool-executor.service';
import { ToolRegistryService } from './tool-registry.service';

describe('InternalToolsController', () => {
  let controller: InternalToolsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalToolsController],
      providers: [
        {
          provide: ToolRegistryService,
          useValue: {
            list: jest.fn().mockReturnValue([
              {
                name: 'get_portfolio_snapshot',
                version: '1',
                readOnly: true,
              },
            ]),
            describe: jest.fn(),
            get: jest.fn(),
          },
        },
        {
          provide: ToolExecutorService,
          useValue: { execute: jest.fn() },
        },
        {
          provide: ToolAuditService,
          useValue: { listForUser: jest.fn(), findForUser: jest.fn() },
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(InternalToolsController);
  });

  it('lists catalog with forbidden tool names', () => {
    const catalog = controller.listCatalog();

    expect(catalog.readOnly).toBe(true);
    expect(catalog.tools).toHaveLength(1);
    expect(catalog.forbiddenToolNames).toContain('place_order');
  });
});
