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

logger.info('Queue processor initialized', {
  concurrency: 10,
  emailsPerSecond: EMAILS_PER_SECOND,
});

export default emailQueue;
