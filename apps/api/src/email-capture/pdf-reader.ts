import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
export function readPdf(buffer: Buffer, password?: string): Promise<string> {
  if (buffer.length > 15 * 1024 * 1024)
    return Promise.reject(new Error('DOCUMENT_TOO_LARGE'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        const pdfjs = await import(workerData.moduleUrl);
        const task = pdfjs.getDocument({ data: new Uint8Array(workerData.bytes), password: workerData.password,
          standardFontDataUrl: workerData.fonts, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, useWorkerFetch: false });
        const pdf = await task.promise;
        if (pdf.numPages > 150) throw new Error('TOO_MANY_PAGES');
        const lines = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          const content = await (await pdf.getPage(n)).getTextContent();
          const rows = new Map();
          for (const item of content.items) if ('str' in item) {
            const y = Math.round(item.transform[5] / 3) * 3;
            if (!rows.has(y)) rows.set(y, []);
            rows.get(y).push({ x: item.transform[4], text: item.str });
          }
          for (const [, row] of [...rows].sort((a,b) => b[0]-a[0])) lines.push(row.sort((a,b) => a.x-b.x).map(i => i.text).join(' '));
        }
        await task.destroy(); parentPort.postMessage({ text: lines.join('\\n') });
      })().catch(e => parentPort.postMessage({ error: e.name === 'PasswordException' ? 'PASSWORD_REQUIRED' : e.message === 'TOO_MANY_PAGES' ? e.message : 'PDF_PARSE_FAILED' }));
    `,
      {
        eval: true,
        workerData: {
          moduleUrl: require.resolve('pdfjs-dist/legacy/build/pdf.mjs'),
          fonts: join(
            dirname(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')),
            '../../standard_fonts/',
          ),
          bytes: buffer,
          password,
        },
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('PDF_TIMEOUT'));
    }, 30000);
    worker.once('message', (result: { text?: string; error?: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (result.error) reject(new Error(result.error));
      else resolve(result.text ?? '');
    });
    worker.once('error', () => {
      clearTimeout(timer);
      reject(new Error('PDF_PARSE_FAILED'));
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('PDF_WORKER_EXIT'));
    });
  });
}
