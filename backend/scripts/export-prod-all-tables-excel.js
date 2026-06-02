/**
 * Export every public Postgres table to one Excel workbook (one sheet per table)
 * and/or a folder of CSV files (one file per table).
 *
 * Usage:
 *   npm run export:tables          # uses .env.prod
 *   npm run export:tables:tunnel   # Mac + SSH tunnel
 *
 * Env:
 *   OUTPUT_XLSX=path/to/file.xlsx
 *   OUTPUT_CSV_DIR=path/to/csv-folder   (default: alongside xlsx)
 *   MAX_ROWS_PER_TABLE=500000           (optional cap)
 *   SKIP_TABLES=comma,separated,names
 *   CSV_ONLY=1                          (skip xlsx)
 *   XLSX_ONLY=1                         (skip csv)
 */
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Use: npm run export:tables or export:tables:tunnel');
  process.exit(1);
}

const MAX_ROWS = Number(process.env.MAX_ROWS_PER_TABLE || 0) || Infinity;
const SKIP = new Set(
  (process.env.SKIP_TABLES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const CSV_ONLY = process.env.CSV_ONLY === '1';
const XLSX_ONLY = process.env.XLSX_ONLY === '1';

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
});

function safeSheetName(name) {
  return name.replace(/[:\\/?*\[\]]/g, '_').slice(0, 31);
}

function serializeCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value === 'object') {
    if (typeof value.toString === 'function' && value.constructor?.name === 'Decimal') {
      return value.toString();
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

function rowsToAoA(columns, rows) {
  const header = columns.map((c) => c.column_name);
  const data = rows.map((row) =>
    columns.map((c) => serializeCell(row[c.column_name])),
  );
  return [header, ...data];
}

async function listTables() {
  return prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
}

async function getColumns(table) {
  return prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position
  `;
}

async function fetchTableData(table, columns) {
  const colList = columns.map((c) => `"${c.column_name}"`).join(', ');
  const limitSql =
    Number.isFinite(MAX_ROWS) && MAX_ROWS < Infinity
      ? ` LIMIT ${Math.floor(MAX_ROWS)}`
      : '';
  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${colList} FROM "${table}"${limitSql}`,
  );
  return rows;
}

async function main() {
  const host = (() => {
    try {
      return new URL(DATABASE_URL.replace(/^postgresql:/, 'http:')).hostname;
    } catch {
      return '?';
    }
  })();
  console.log(`Database host: ${host}`);

  const tables = await listTables();
  const tableNames = tables.map((t) => t.tablename).filter((n) => !SKIP.has(n));
  console.log(`Exporting ${tableNames.length} tables…`);

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.join(__dirname, '../../exports');
  fs.mkdirSync(outDir, { recursive: true });

  const xlsxPath =
    process.env.OUTPUT_XLSX || path.join(outDir, `tunect-prod-all-tables-${stamp}.xlsx`);
  const csvDir =
    process.env.OUTPUT_CSV_DIR ||
    path.join(outDir, `tunect-prod-csv-${stamp}`);

  if (!XLSX_ONLY) {
    fs.mkdirSync(csvDir, { recursive: true });
  }

  const workbook = XLSX.utils.book_new();
  const schemaRows = [];

  let exported = 0;
  for (const table of tableNames) {
    process.stdout.write(`  ${table}… `);
    const columns = await getColumns(table);
    if (!columns.length) {
      console.log('skip (no columns)');
      continue;
    }

    for (const c of columns) {
      schemaRows.push({
        table,
        column: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable,
      });
    }

    const rows = await fetchTableData(table, columns);
    const aoa = rowsToAoA(columns, rows);

    if (!XLSX_ONLY) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const csv = XLSX.utils.sheet_to_csv(ws);
      fs.writeFileSync(path.join(csvDir, `${table}.csv`), csv, 'utf8');
    }

    if (!CSV_ONLY) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(workbook, ws, safeSheetName(table));
    }

    exported += 1;
    console.log(`${rows.length} rows`);
  }

  if (!CSV_ONLY) {
    const schemaWs = XLSX.utils.json_to_sheet(schemaRows);
    XLSX.utils.book_append_sheet(workbook, schemaWs, '_Table_Schema');
    XLSX.writeFile(workbook, xlsxPath);
    console.log(`\nExcel: ${xlsxPath}`);
    console.log(`Sheets: ${workbook.SheetNames.length} (includes _Table_Schema)`);
  }

  if (!XLSX_ONLY) {
    fs.writeFileSync(
      path.join(csvDir, '_schema.csv'),
      XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(schemaRows)),
      'utf8',
    );
    console.log(`CSV folder: ${csvDir} (${exported} tables + _schema.csv)`);
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
