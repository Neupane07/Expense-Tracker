import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPdf } from './pdf-reader';
import { parseStatementText } from './expense-parser';
describe('isolated PDF extraction', () => {
  it('extracts a complete synthetic statement', async () => {
    const text = await readPdf(
      readFileSync(join(__dirname, 'fixtures/synthetic-statement.pdf')),
    );
    expect(parseStatementText(text)).toMatchObject({
      reconciled: true,
      rows: [expect.objectContaining({ moneyOut: 1200 })],
    });
  });
  it('requires the correct password for an encrypted statement', async () => {
    const bytes = readFileSync(
      join(__dirname, 'fixtures/synthetic-protected-statement.pdf'),
    );
    await expect(readPdf(bytes)).rejects.toThrow('PASSWORD_REQUIRED');
    await expect(readPdf(bytes, 'wrong')).rejects.toThrow('PASSWORD_REQUIRED');
    expect(
      parseStatementText(await readPdf(bytes, 'synthetic-test-password'))
        .reconciled,
    ).toBe(true);
  });
});
