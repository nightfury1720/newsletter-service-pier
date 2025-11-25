import 'dotenv/config';
import { sql } from 'drizzle-orm';
import db from '../config/database.js';
import { emailLogs, content, subscriptions, subscribers, topics } from '../models/schema.js';
import emailQueue from '../config/queue.js';
import logger from '../config/logger.js';

async function cleanupDatabase() {
  try {
    logger.info('Starting database cleanup...');

    await db.delete(emailLogs);
    logger.info('Cleared email_logs table');

    await db.delete(content);
    logger.info('Cleared content table');

    await db.delete(subscriptions);
    logger.info('Cleared subscriptions table');

    await db.delete(subscribers);
    logger.info('Cleared subscribers table');

    await db.delete(topics);
    logger.info('Cleared topics table');

    await db.execute(sql`ALTER SEQUENCE topics_id_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE subscribers_id_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE content_id_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE email_logs_id_seq RESTART WITH 1`);
    logger.info('Reset all sequences');

    logger.info('Database cleanup completed successfully');
  } catch (error) {
    logger.error('Error during database cleanup', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
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

