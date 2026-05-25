import * as XLSX from 'xlsx';
import { StatementRow } from './statement-parser.interface';

export function readStatementFile(fileName: string, buffer: Buffer) {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    return parseCsv(buffer.toString('utf8'));
  }

  if (extension === 'xls' || extension === 'xlsx') {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
    });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return [];
    }

    return XLSX.utils.sheet_to_json<StatementRow>(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    });
  }

  throw new Error('Unsupported file type. Upload a CSV, XLS, or XLSX file.');
}

function parseCsv(input: string) {
  const rows: StatementRow[] = [];
  let cell = '';
  let row: StatementRow = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      row.push(cell.trim());
      appendRow(rows, row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  appendRow(rows, row);

  return rows;
}

function appendRow(rows: StatementRow[], row: StatementRow) {
  if (row.some((cell) => cell !== null && String(cell).trim() !== '')) {
    rows.push(row);
  }
}
