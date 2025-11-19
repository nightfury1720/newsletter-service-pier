import { Request, Response } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import db from '../config/database.js';
import { topics, subscriptions, subscribers } from '../models/schema.js';
import logger from '../config/logger.js';

export const createTopic = async (req: Request, res: Response): Promise<void> => {
  const { name, description } = req.body;

  if (!name || name.trim().length === 0) {
    res.status(400).json({ error: 'Topic name is required' });
    return;
  }

  try {
    const [topic] = await db.insert(topics).values({
      name: name.trim(),
      description: description || null,
    }).returning();

    logger.info('Topic created', { id: topic.id, name: topic.name });
    res.status(201).json(topic);
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Topic with this name already exists' });
      return;
    }
    logger.error('Error creating topic', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to create topic' });
  }
};

export const getTopics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const allTopics = await db.select().from(topics).orderBy(desc(topics.created_at));

    const topicsWithCount = await Promise.all(
      allTopics.map(async (topic) => {
        const activeSubscriptions = await db
          .select()
          .from(subscriptions)
          .innerJoin(subscribers, eq(subscriptions.subscriber_id, subscribers.id))
          .where(and(
            eq(subscriptions.topic_id, topic.id),
            eq(subscribers.is_active, true)
          ));

        return {
          ...topic,
          subscriber_count: activeSubscriptions.length.toString(),
        };
      })
    );

    res.json(topicsWithCount);
  } catch (error) {
    logger.error('Error fetching topics', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
};

export const getTopic = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const [topic] = await db.select().from(topics).where(eq(topics.id, parseInt(id))).limit(1);

    if (!topic) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    const activeSubscriptions = await db
      .select()
      .from(subscriptions)
      .innerJoin(subscribers, eq(subscriptions.subscriber_id, subscribers.id))
      .where(and(
        eq(subscriptions.topic_id, topic.id),
        eq(subscribers.is_active, true)
      ));

    res.json({
      ...topic,
      subscriber_count: activeSubscriptions.length.toString(),
    });
  } catch (error) {
    logger.error('Error fetching topic', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to fetch topic' });
  }
};

export const deleteTopic = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await db.delete(topics).where(eq(topics.id, parseInt(id))).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    logger.info('Topic deleted', { id });
    res.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    logger.error('Error deleting topic', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to delete topic' });
  }
};
