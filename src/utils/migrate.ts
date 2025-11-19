import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import logger from '../config/logger.js';

const runMigrations = async (): Promise<void> => {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    logger.info('Connecting to database...');
    const connectionString = process.env.DATABASE_URL;
    const client = postgres(connectionString, { max: 1 });
    const db = drizzle(client);

    logger.info('Running migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });

    logger.info('Migrations completed successfully');
    await client.end();
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', { error: (error as Error).message });
    process.exit(1);
  }
};

runMigrations();
