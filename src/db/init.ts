import * as fs from 'fs';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';

const DB_PATH = process.env.DB_PATH || 'data/clinic_paths.db';

export function getDb(): sqlite3.Database {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const db = new sqlite3.Database(DB_PATH);
  return db;
}

export function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getDb();
    // Look for schema.sql in src/db/ (source) not in dist
    const sourceDir = path.join(process.cwd(), 'src');
    const schemaPath = path.join(sourceDir, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    db.exec(schema, (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('Database initialized successfully');
      resolve();
    });
  });
}

// Quick check if DB exists
export function checkDbExists(): boolean {
  return fs.existsSync(DB_PATH);
}

export function seedDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const seedPath = path.join(process.cwd(), 'data', 'seed.sql');
    if (!fs.existsSync(seedPath)) {
      reject(new Error(`Seed SQL file not found: ${seedPath}`));
      return;
    }

    const db = getDb();
    const seedSql = fs.readFileSync(seedPath, 'utf-8');

    db.exec(seedSql, (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('Database seeded successfully');
      resolve();
    });
  });
}

export { DB_PATH };
