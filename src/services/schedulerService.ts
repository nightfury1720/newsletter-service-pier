import cron from 'node-cron';
import { eq, and, lte } from 'drizzle-orm';
import db from '../config/database.js';
import { content, subscriptions, subscribers } from '../models/schema.js';
import emailQueue from '../config/queue.js';
import logger from '../config/logger.js';

class SchedulerService {
  private isRunning: boolean = false;

  start(): void {
    logger.info('Starting scheduler service');

    cron.schedule('* * * * *', async () => {
      if (this.isRunning) {
        logger.warn('Previous scheduler run still in progress, skipping');
        return;
      }

      this.isRunning = true;
      try {
        await this.processPendingContent();
      } catch (error) {
        logger.error('Error in scheduler', {
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
      } finally {
        this.isRunning = false;
      }
    });

    logger.info('Scheduler service started (runs every minute)');
  }

  private async processPendingContent(): Promise<void> {
    try {
      const now = new Date();

      const contents = await db.select({
        id: content.id,
        topic_id: content.topic_id,
        title: content.title,
        body: content.body,
        scheduled_time: content.scheduled_time,
      })
        .from(content)
        .where(and(
          lte(content.scheduled_time, now),
          eq(content.is_sent, false),
          eq(content.status, 'pending')
        ))
        .limit(10);

      if (!contents || contents.length === 0) {
        return;
      }

      logger.info('Found pending content to process', {
        count: contents.length,
        contentIds: contents.map(c => c.id),
      });

      for (const contentItem of contents) {
        const scheduledTime = new Date(contentItem.scheduled_time);
        const timeUntilScheduled = scheduledTime.getTime() - now.getTime();
        
        logger.info('Processing content item', {
          contentId: contentItem.id,
          title: contentItem.title,
          topicId: contentItem.topic_id,
          scheduledTime: scheduledTime.toISOString(),
          timeUntilScheduled: timeUntilScheduled > 0 ? `${Math.round(timeUntilScheduled / 1000)}s` : 'overdue',
        });

        const updateResult = await db.update(content)
          .set({ status: 'processing' })
          .where(eq(content.id, contentItem.id))
          .returning();

        if (updateResult.length === 0) {
          logger.error('Error updating content status to processing', { contentId: contentItem.id });
          continue;
        }

        logger.info('Content status updated to processing', { contentId: contentItem.id });

        const subscriptionData = await db
          .select({
            subscriber_id: subscriptions.subscriber_id,
            subscriber: {
              id: subscribers.id,
              email: subscribers.email,
              is_active: subscribers.is_active,
            },
          })
          .from(subscriptions)
          .innerJoin(subscribers, eq(subscriptions.subscriber_id, subscribers.id))
          .where(and(
            eq(subscriptions.topic_id, contentItem.topic_id),
            eq(subscribers.is_active, true)
          ));

        if (!subscriptionData || subscriptionData.length === 0) {
          logger.warn('No active subscribers found for content, marking as sent', {
            contentId: contentItem.id,
            topicId: contentItem.topic_id,
          });
          await db.update(content)
            .set({
              is_sent: true,
              status: 'sent',
              sent_at: new Date(),
            })
            .where(eq(content.id, contentItem.id));
          continue;
        }

        logger.info('Adding emails to queue', {
          contentId: contentItem.id,
          title: contentItem.title,
          subscriberCount: subscriptionData.length,
          subscriberEmails: subscriptionData.map(s => s.subscriber?.email).filter(Boolean),
        });

        let queuedCount = 0;
        for (const subscription of subscriptionData) {
          const subscriber = subscription.subscriber;
          if (!subscriber) continue;

          await emailQueue.add(
            'send-newsletter',
            {
              contentId: contentItem.id,
              subscriberId: subscriber.id,
              subscriberEmail: subscriber.email,
              title: contentItem.title || 'Newsletter',
              body: contentItem.body,
            },
            {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
            }
          );
          queuedCount++;
        }

        logger.info('All emails queued for content', {
          contentId: contentItem.id,
          queuedCount,
          totalSubscribers: subscriptionData.length,
        });
      }
    } catch (error) {
      logger.error('Error processing pending content', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  stop(): void {
    logger.info('Stopping scheduler service');
    this.isRunning = false;
  }
}

export default new SchedulerService();
