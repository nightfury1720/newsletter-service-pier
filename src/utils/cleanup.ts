import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { sql } from 'postgres';
import * as schema from '../models/schema.js';
import emailQueue from '../config/queue.js';
import logger from '../config/logger.js';

async function cleanupDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const connectionString = process.env.DATABASE_URL;
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    logger.info('Starting database cleanup...');

    await client`TRUNCATE TABLE email_logs CASCADE`;
    logger.info('Cleared email_logs table');

    await client`TRUNCATE TABLE content CASCADE`;
    logger.info('Cleared content table');

    await client`TRUNCATE TABLE subscriptions CASCADE`;
    logger.info('Cleared subscriptions table');

    await client`TRUNCATE TABLE subscribers CASCADE`;
    logger.info('Cleared subscribers table');

    await client`TRUNCATE TABLE topics CASCADE`;
    logger.info('Cleared topics table');

    await client`ALTER SEQUENCE topics_id_seq RESTART WITH 1`;
    await client`ALTER SEQUENCE subscribers_id_seq RESTART WITH 1`;
    await client`ALTER SEQUENCE content_id_seq RESTART WITH 1`;
    await client`ALTER SEQUENCE email_logs_id_seq RESTART WITH 1`;
    logger.info('Reset all sequences');

    logger.info('Database cleanup completed successfully');
  } catch (error) {
    logger.error('Error during database cleanup', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  } finally {
    await client.end();
  }
}

async function cleanupQueue() {
  try {
    logger.info('Starting queue cleanup...');

    await emailQueue.obliterate({ force: true });
    logger.info('Cleared email queue');

    const waiting = await emailQueue.getWaiting();
    const active = await emailQueue.getActive();
    const delayed = await emailQueue.getDelayed();
    const completed = await emailQueue.getCompleted();
    const failed = await emailQueue.getFailed();

    logger.info('Queue status after cleanup', {
      waiting: waiting.length,
      active: active.length,
      delayed: delayed.length,
      completed: completed.length,
      failed: failed.length,
    });

    logger.info('Queue cleanup completed successfully');
  } catch (error) {
    logger.error('Error during queue cleanup', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
}

async function cleanup() {
  try {
    logger.info('Starting full cleanup (database + queue)...');
    
    await cleanupDatabase();
    await cleanupQueue();
    
    logger.info('Full cleanup completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Cleanup failed', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    process.exit(1);
  }
}

cleanup();

