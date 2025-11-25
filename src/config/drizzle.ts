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
  const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS || '5');
  const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT || '30000');
  const connectTimeout = parseInt(process.env.DB_CONNECT_TIMEOUT || '10000');
  
  client = postgres(connectionString, {
    onnotice: () => {},
    max: maxConnections,
    idle_timeout: idleTimeout / 1000,
    connect_timeout: connectTimeout / 1000,
    connection: {
      application_name: 'newsletter-service',
    },
    transform: {
      undefined: null,
    },
  });
  
  const dbHost = connectionString.split('@')[1]?.split(':')[0] || 'unknown';
  logger.info('Database client initialized', { 
    host: dbHost,
    maxConnections,
    idleTimeout,
    connectTimeout,
  });
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

