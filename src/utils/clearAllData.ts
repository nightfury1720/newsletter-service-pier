import 'dotenv/config';
import db from '../config/database.js';
import { emailLogs, content, subscriptions, subscribers, topics } from '../models/schema.js';
import logger from '../config/logger.js';
import Redis from 'ioredis';

async function getRedisClient(): Promise<Redis> {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }

  const useTls = process.env.REDIS_TLS === 'true';
  const config: any = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
  };

  if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD;
  }

  if (useTls) {
    config.tls = {};
  }

  return new Redis(config);
}

async function clearRedisData() {
  let redis: Redis | null = null;
  try {
    logger.info('Connecting to Redis...');
    redis = await getRedisClient();

    redis.on('error', (error: Error) => {
      logger.error('Redis error', { error: error.message });
    });

    if (redis && redis.status !== 'ready') {
      await new Promise<void>((resolve, reject) => {
        if (!redis) {
          reject(new Error('Redis client is null'));
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error('Redis connection timeout'));
        }, 10000);

        const readyHandler = () => {
          clearTimeout(timeout);
          logger.info('Redis client ready');
          redis?.off('ready', readyHandler);
          redis?.off('error', errorHandler);
          resolve();
        };
        
        const errorHandler = (error: Error) => {
          clearTimeout(timeout);
          redis?.off('ready', readyHandler);
          redis?.off('error', errorHandler);
          reject(error);
        };

        redis.on('ready', readyHandler);
        redis.on('error', errorHandler);
      });
    } else {
      logger.info('Redis client already ready');
    }

    logger.info('Flushing all Redis data...');
    await redis.flushall();
    logger.info('Successfully flushed all Redis data');

    await redis.quit();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error clearing Redis data', { error: (error as Error).message });
    if (redis) {
      try {
        await redis.quit();
      } catch (e) {
        // Ignore quit errors
      }
    }
    throw error;
  }
}

async function clearDatabaseData() {
  try {
    logger.info('Starting database data clearing...');

    logger.info('Deleting email logs...');
    const deletedEmailLogs = await db.delete(emailLogs).returning();
    logger.info(`Deleted ${deletedEmailLogs.length} email log records`);

    logger.info('Deleting content...');
    const deletedContent = await db.delete(content).returning();
    logger.info(`Deleted ${deletedContent.length} content records`);

    logger.info('Deleting subscriptions...');
    const deletedSubscriptions = await db.delete(subscriptions).returning();
    logger.info(`Deleted ${deletedSubscriptions.length} subscription records`);

    logger.info('Deleting subscribers...');
    const deletedSubscribers = await db.delete(subscribers).returning();
    logger.info(`Deleted ${deletedSubscribers.length} subscriber records`);

    logger.info('Deleting topics...');
    const deletedTopics = await db.delete(topics).returning();
    logger.info(`Deleted ${deletedTopics.length} topic records`);

    logger.info('Database data clearing completed successfully');
  } catch (error) {
    logger.error('Error clearing database data', { error: (error as Error).message });
    throw error;
  }
}

async function clearAllData() {
  try {
    logger.info('========================================');
    logger.info('Starting data clearing process...');
    logger.info('========================================');

    await clearDatabaseData();
    await clearRedisData();

    logger.info('========================================');
    logger.info('All data cleared successfully!');
    logger.info('========================================');
  } catch (error) {
    logger.error('Error during data clearing process', { error: (error as Error).message });
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  clearAllData()
    .then(() => {
      logger.info('Data clearing process completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Data clearing process failed', { error: (error as Error).message });
      process.exit(1);
    });
}

export { clearAllData, clearDatabaseData, clearRedisData };

