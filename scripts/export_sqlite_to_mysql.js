import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'crm.sqlite');
const outputPath = path.join(__dirname, '..', 'insert_data.sql');

if (!fs.existsSync(dbPath)) {
  console.log('No local database found at', dbPath);
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
let sql = '-- Exported SQLite Data for MySQL import\nSET FOREIGN_KEY_CHECKS=0;\n\n';

const tables = ['users', 'companies', 'customers', 'items', 'invoices', 'invoice_lines', 'estimates', 'estimate_lines', 'payments', 'followups', 'domains', 'settings'];

for (const table of tables) {
  try {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) continue;
    sql += `-- Data for table \`${table}\`\n`;
    for (const row of rows) {
      const keys = Object.keys(row).map(k => `\`${k}\``).join(', ');
      const values = Object.values(row).map(v => {
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return v;
        return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
      }).join(', ');
      sql += `INSERT INTO \`${table}\` (${keys}) VALUES (${values});\n`;
    }
    sql += '\n';
  } catch (e) {
    // Ignore missing table errors
  }
}

sql += 'SET FOREIGN_KEY_CHECKS=1;\n';
fs.writeFileSync(outputPath, sql, 'utf8');
console.log('Exported database content to insert_data.sql successfully!');
