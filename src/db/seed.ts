import * as fs from 'fs';
import * as path from 'path';
import { getDb } from './init';

const SEED_SQL_PATH = path.join(process.cwd(), 'data', 'seed.sql');

export function seedDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(SEED_SQL_PATH)) {
      reject(new Error(`Seed SQL file not found: ${SEED_SQL_PATH}`));
      return;
    }

    const db = getDb();
    const seedSql = fs.readFileSync(SEED_SQL_PATH, 'utf-8');

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

// Run seed if executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Seed completed');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}