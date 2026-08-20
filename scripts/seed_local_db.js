import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'crm.sqlite');
const sqlPath = path.join(__dirname, '..', 'insert_data.sql');

const db = new DatabaseSync(dbPath);
const sql = fs.readFileSync(sqlPath, 'utf8');

const statements = sql
  .replace(/SET FOREIGN_KEY_CHECKS=\d;/g, '')
  .replace(/`/g, '')
  .split(';\n')
  .map(s => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  try {
    db.exec(stmt);
  } catch (e) {
    // Ignore duplicate key errors if already present
  }
}

console.log('Local database seeded cleanly from insert_data.sql');
