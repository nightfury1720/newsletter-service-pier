import 'dotenv/config';
import { eq, and, count } from 'drizzle-orm';
import emailQueue from '../config/queue.js';
import emailService from './emailService.js';
import db from '../config/database.js';
import { emailLogs, content, subscriptions, subscribers } from '../models/schema.js';
import logger from '../config/logger.js';

const EMAILS_PER_SECOND = parseInt(process.env.EMAILS_PER_SECOND || '10');
const DELAY_BETWEEN_EMAILS = 1000 / EMAILS_PER_SECOND;

class RateLimiter {
  private lastEmailTime: number = 0;

  async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastEmail = now - this.lastEmailTime;

    if (timeSinceLastEmail < DELAY_BETWEEN_EMAILS) {
      const waitTime = DELAY_BETWEEN_EMAILS - timeSinceLastEmail;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastEmailTime = Date.now();
  }
}

const rateLimiter = new RateLimiter();

emailQueue.process('send-newsletter', 10, async (job) => {
  const { contentId, subscriberId, subscriberEmail, title, body } = job.data;
  const startTime = Date.now();

  try {
    await rateLimiter.rateLimit();

    logger.info('Processing email job', {
      jobId: job.id,
      contentId,
      subscriberId,
      email: subscriberEmail,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
    });

    const result = await emailService.sendEmail(
      subscriberEmail,
      title || 'Newsletter',
      body
    );

    const processingTime = Date.now() - startTime;

    await db.insert(emailLogs).values({
      content_id: contentId,
      subscriber_id: subscriberId,
      status: 'sent',
      message_id: result.messageId,
      sent_at: new Date(),
    }).onConflictDoUpdate({
      target: [emailLogs.content_id, emailLogs.subscriber_id],
      set: {
        status: 'sent',
        message_id: result.messageId,
        sent_at: new Date(),
      },
    });

    logger.info('Email sent successfully', {
      jobId: job.id,
      contentId,
      subscriberId,
      subscriberEmail,
      messageId: result.messageId,
      processingTimeMs: processingTime,
    });

    const shouldCheckCompletion = Math.random() < 0.1 || job.attemptsMade === 0;
    
    if (shouldCheckCompletion) {
      const [contentItem] = await db.select({ topic_id: content.topic_id })
        .from(content)
        .where(eq(content.id, contentId))
        .limit(1);

      if (contentItem) {
        const [sentCountResult, activeSubscriptions] = await Promise.all([
          db
            .select({ count: count() })
            .from(emailLogs)
            .where(and(
              eq(emailLogs.content_id, contentId),
              eq(emailLogs.status, 'sent')
            )),
          db
            .select()
            .from(subscriptions)
            .innerJoin(subscribers, eq(subscriptions.subscriber_id, subscribers.id))
            .where(and(
              eq(subscriptions.topic_id, contentItem.topic_id),
              eq(subscribers.is_active, true)
            )),
        ]);

        const sentCount = sentCountResult[0]?.count || 0;
        const totalSubscribers = activeSubscriptions.length;

        logger.info('Email progress for content', {
          contentId,
          sentCount,
          totalSubscribers,
          remaining: totalSubscribers - sentCount,
          progressPercent: totalSubscribers > 0 ? Math.round((sentCount / totalSubscribers) * 100) : 0,
        });

        if (sentCount > 0 && totalSubscribers > 0 && sentCount >= totalSubscribers) {
          await db.update(content)
            .set({
              is_sent: true,
              status: 'sent',
              sent_at: new Date(),
            })
            .where(eq(content.id, contentId));

          logger.info('All emails sent for content - marking as complete', {
            contentId,
            totalSent: sentCount,
            totalSubscribers,
          });
        }
      }
    }

    return { success: true, messageId: result.messageId };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = (error as Error).message;

    logger.error('Failed to process email job', {
      jobId: job.id,
      contentId,
      subscriberId,
      subscriberEmail,
      error: errorMessage,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
      processingTimeMs: processingTime,
      willRetry: (job.attemptsMade + 1) < (job.opts.attempts || 3),
    });

    try {
      await db.insert(emailLogs).values({
        content_id: contentId,
        subscriber_id: subscriberId,
        status: 'failed',
        error_message: errorMessage,
        sent_at: new Date(),
      }).onConflictDoUpdate({
        target: [emailLogs.content_id, emailLogs.subscriber_id],
        set: {
          status: 'failed',
          error_message: errorMessage,
          sent_at: new Date(),
        },
      });
    } catch (dbError) {
      logger.error('Failed to log email error to database', {
        contentId,
        subscriberId,
        error: (dbError as Error).message,
      });
    }

    throw error;
  }
});

let isQueueReady = false;
let connectionCheckInterval: NodeJS.Timeout | null = null;

async function checkQueueConnection(): Promise<boolean> {
  try {
    const client = emailQueue.client;
    if (!client) {
      logger.warn('Queue processor: Redis client not available');
      return false;
    }
    
    const status = client.status;
    const isReady = status === 'ready' || status === 'connect';
    
    if (!isReady && isQueueReady) {
      logger.error('Queue processor: Redis connection lost', {
        previousStatus: 'ready',
        currentStatus: status,
      });
      isQueueReady = false;
    }
    
    return isReady;
  } catch (error) {
    logger.error('Queue processor: Error checking Redis connection', {
      error: (error as Error).message,
    });
    return false;
  }
}

emailQueue.on('ready', () => {
  isQueueReady = true;
  logger.info('Queue processor connected to Redis and ready to process jobs', {
    queueName: 'email-queue',
    concurrency: 10,
    emailsPerSecond: EMAILS_PER_SECOND,
  });
});

emailQueue.on('error', (error: Error) => {
  isQueueReady = false;
  logger.error('Queue processor Redis connection error', {
    error: error.message,
    stack: error.stack,
    redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
  });
});

emailQueue.on('close', () => {
  isQueueReady = false;
  logger.warn('Queue processor: Redis connection closed');
});

connectionCheckInterval = setInterval(async () => {
  const isConnected = await checkQueueConnection();
  
  if (!isConnected && !isQueueReady) {
    logger.warn('Queue processor: Redis not connected, jobs may not be processed', {
      willRetry: true,
    });
  }
}, 30000);

logger.info('Queue processor initialized', {
  concurrency: 10,
  emailsPerSecond: EMAILS_PER_SECOND,
  jobName: 'send-newsletter',
});

setTimeout(async () => {
  const isConnected = await checkQueueConnection();
  if (!isConnected) {
    logger.error('Queue processor: Initial Redis connection check failed', {
      warning: 'Jobs may not be processed until connection is established',
      redisUrl: process.env.REDIS_URL ? 'configured' : 'REDIS_URL not set',
    });
    
    // Try to explicitly trigger connection
    try {
      const client = emailQueue.client;
      if (client && typeof client.connect === 'function') {
        await client.connect();
        logger.info('Queue processor: Explicitly triggered Redis connection');
      }
    } catch (connectError) {
      logger.error('Queue processor: Failed to trigger explicit connection', {
        error: (connectError as Error).message,
      });
    }
  } else {
    logger.info('Queue processor: Redis connection verified, ready to process jobs');
    
    // Check if there are waiting jobs that need processing
    try {
      const waiting = await emailQueue.getWaiting();
      if (waiting.length > 0) {
        logger.info('Queue processor: Found waiting jobs that will be processed', {
          waitingCount: waiting.length,
        });
      }
    } catch (error) {
      logger.warn('Queue processor: Could not check waiting jobs', {
        error: (error as Error).message,
      });
    }
  }
}, 5000);

export default emailQueue;
