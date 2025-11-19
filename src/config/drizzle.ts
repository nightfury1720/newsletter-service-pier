import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../models/schema.js';
import logger from './logger.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const connectionString = process.env.DATABASE_URL;

let client;
try {
  client = postgres(connectionString, {
    onnotice: () => {},
    connection: {
      application_name: 'newsletter-service',
    },
  });
  
  const dbHost = connectionString.split('@')[1]?.split(':')[0] || 'unknown';
  logger.info('Database client initialized', { host: dbHost });
} catch (error) {
  logger.error('Failed to initialize database client', {
    error: (error as Error).message,
    stack: (error as Error).stack,
    code: (error as any).code,
  });
  throw error;
}

const db = drizzle(client!, { schema });

export default db;

