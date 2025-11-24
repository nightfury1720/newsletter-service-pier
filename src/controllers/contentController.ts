import { Request, Response } from 'express';
import { eq, desc, and, count, SQL } from 'drizzle-orm';
import db from '../config/database.js';
import { content, topics, emailLogs, subscriptions, subscribers } from '../models/schema.js';
import logger from '../config/logger.js';
import emailQueue from '../config/queue.js';

async function getQueueStatsForContent(contentId: number) {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      emailQueue.getWaiting(),
      emailQueue.getActive(),
      emailQueue.getCompleted(),
      emailQueue.getFailed(),
    ]);

    const filterByContentId = (jobs: any[]) => 
      jobs.filter(job => job.data?.contentId === contentId);

    return {
      waiting: filterByContentId(waiting).length,
      active: filterByContentId(active).length,
      completed: filterByContentId(completed).length,
      failed: filterByContentId(failed).length,
    };
  } catch (error) {
    logger.error('Error getting queue stats', { contentId, error: (error as Error).message });
    return { waiting: 0, active: 0, completed: 0, failed: 0 };
  }
}

export const createContent = async (req: Request, res: Response): Promise<void> => {
  const { topicId, title, body, scheduledTime } = req.body;

  if (!topicId || !body || !scheduledTime) {
    res.status(400).json({
      error: 'topicId, body, and scheduledTime are required',
    });
    return;
  }

  const scheduledDate = new Date(scheduledTime);
  if (isNaN(scheduledDate.getTime())) {
    res.status(400).json({ error: 'Invalid scheduledTime format' });
    return;
  }

  try {
    const [topic] = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);

    if (!topic) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    const [createdContent] = await db.insert(content).values({
      topic_id: topicId,
      title: title || null,
      body: body,
      scheduled_time: scheduledDate,
    }).returning();

    logger.info('Content created', { id: createdContent.id, topicId, scheduledTime });
    res.status(201).json(createdContent);
  } catch (error) {
    logger.error('Error creating content', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to create content' });
  }
};

export const getContent = async (req: Request, res: Response): Promise<void> => {
  const { topicId, status, limit = '50', offset = '0' } = req.query;

  try {
    const conditions: SQL<unknown>[] = [];
    if (topicId) {
      conditions.push(eq(content.topic_id, parseInt(topicId as string)));
    }
    if (status) {
      conditions.push(eq(content.status, status as 'pending' | 'processing' | 'sent'));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const contents = await db.select({
      content: content,
      topic: {
        name: topics.name,
      },
    })
      .from(content)
      .leftJoin(topics, eq(content.topic_id, topics.id))
      .where(whereClause)
      .orderBy(desc(content.created_at))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    const contentsWithStats = await Promise.all(
      contents.map(async (item: any) => {
        const [emailsSentResult] = await db
          .select({ count: count() })
          .from(emailLogs)
          .where(and(
            eq(emailLogs.content_id, item.content.id),
            eq(emailLogs.status, 'sent')
          ));

        const [emailsFailedResult] = await db
          .select({ count: count() })
          .from(emailLogs)
          .where(and(
            eq(emailLogs.content_id, item.content.id),
            eq(emailLogs.status, 'failed')
          ));

        const activeSubscriptions = await db
          .select()
          .from(subscriptions)
          .innerJoin(subscribers, eq(subscriptions.subscriber_id, subscribers.id))
          .where(and(
            eq(subscriptions.topic_id, item.content.topic_id),
            eq(subscribers.is_active, true)
          ));

        const sentCount = emailsSentResult?.count || 0;
        const failedCount = emailsFailedResult?.count || 0;
        const totalSubscribers = activeSubscriptions.length;
        const remaining = totalSubscribers - sentCount - failedCount;

        const queueStats = item.content.status === 'processing' 
          ? await getQueueStatsForContent(item.content.id)
          : { waiting: 0, active: 0, completed: 0, failed: 0 };

        return {
          ...item.content,
          topic_name: item.topic?.name || null,
          emails_sent: sentCount,
          emails_failed: failedCount,
          total_subscribers: totalSubscribers,
          emails_remaining: remaining > 0 ? remaining : 0,
          queue_stats: queueStats,
        };
      })
    );

    res.json(contentsWithStats);
  } catch (error) {
    logger.error('Error fetching content', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to fetch content' });
  }
};

export const getContentById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const [contentItem] = await db
      .select({
        content: content,
        topic: {
          name: topics.name,
        },
      })
      .from(content)
      .leftJoin(topics, eq(content.topic_id, topics.id))
      .where(eq(content.id, parseInt(id)))
      .limit(1);

    if (!contentItem) {
      res.status(404).json({ error: 'Content not found' });
      return;
    }

    const [emailsSentResult] = await db
      .select({ count: count() })
      .from(emailLogs)
      .where(and(
        eq(emailLogs.content_id, contentItem.content.id),
        eq(emailLogs.status, 'sent')
      ));

    const [emailsFailedResult] = await db
      .select({ count: count() })
      .from(emailLogs)
      .where(and(
        eq(emailLogs.content_id, contentItem.content.id),
        eq(emailLogs.status, 'failed')
      ));

    const activeSubscriptions = await db
      .select()
      .from(subscriptions)
      .innerJoin(subscribers, eq(subscriptions.subscriber_id, subscribers.id))
      .where(and(
        eq(subscriptions.topic_id, contentItem.content.topic_id),
        eq(subscribers.is_active, true)
      ));

    const sentCount = emailsSentResult?.count || 0;
    const failedCount = emailsFailedResult?.count || 0;
    const totalSubscribers = activeSubscriptions.length;
    const remaining = totalSubscribers - sentCount - failedCount;

    const queueStats = contentItem.content.status === 'processing'
      ? await getQueueStatsForContent(contentItem.content.id)
      : { waiting: 0, active: 0, completed: 0, failed: 0 };

    res.json({
      ...contentItem.content,
      topic_name: contentItem.topic?.name || null,
      emails_sent: sentCount,
      emails_failed: failedCount,
      total_subscribers: totalSubscribers,
      emails_remaining: remaining > 0 ? remaining : 0,
      queue_stats: queueStats,
    });
  } catch (error) {
    logger.error('Error fetching content', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to fetch content' });
  }
};

export const updateContent = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { title, body, scheduledTime } = req.body;

  try {
    const updateData: {
      title?: string | null;
      body?: string;
      scheduled_time?: Date;
    } = {};

    if (title !== undefined) {
      updateData.title = title;
    }

    if (body !== undefined) {
      updateData.body = body;
    }

    if (scheduledTime !== undefined) {
      const scheduledDate = new Date(scheduledTime);
      if (isNaN(scheduledDate.getTime())) {
        res.status(400).json({ error: 'Invalid scheduledTime format' });
        return;
      }
      updateData.scheduled_time = scheduledDate;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const [updatedContent] = await db.update(content)
      .set(updateData)
      .where(and(
        eq(content.id, parseInt(id)),
        eq(content.is_sent, false)
      ))
      .returning();

    if (!updatedContent) {
      res.status(404).json({ error: 'Content not found or already sent' });
      return;
    }

    logger.info('Content updated', { id });
    res.json(updatedContent);
  } catch (error) {
    logger.error('Error updating content', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to update content' });
  }
};

export const deleteContent = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await db.delete(content)
      .where(and(
        eq(content.id, parseInt(id)),
        eq(content.is_sent, false)
      ))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Content not found or already sent' });
      return;
    }

    logger.info('Content deleted', { id });
    res.json({ message: 'Content deleted successfully' });
  } catch (error) {
    logger.error('Error deleting content', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to delete content' });
  }
};
