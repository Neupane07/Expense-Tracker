import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('API access boundary (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('retains public operational health reporting', () =>
    request(app.getHttpServer()).get('/health').expect(200));

  it('does not expose any financial controller without a session', async () => {
    const server = app.getHttpServer();

    await request(server).get('/accounts').expect(401);
    await request(server).get('/imports').expect(401);
    await request(server).post('/imports/preview').expect(401);
    await request(server).get('/transactions').expect(401);
    await request(server).get('/transactions/review').expect(401);
    await request(server).patch('/transactions/guessed/category').expect(401);
    await request(server).get('/rules').expect(401);
    await request(server).post('/rules').expect(401);
    await request(server).post('/rules/guessed/apply').expect(401);
    await request(server).get('/dashboard/summary').expect(401);
    await request(server).get('/dashboard/charts').expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
