import { Request, Response } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import db from '../config/database.js';
import { subscribers, subscriptions, topics } from '../models/schema.js';
import logger from '../config/logger.js';

export const createSubscriber = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  try {
    const [subscriber] = await db.insert(subscribers).values({
      email: email.toLowerCase(),
      is_active: true,
    }).onConflictDoUpdate({
      target: subscribers.email,
      set: { is_active: true },
    }).returning();

    logger.info('Subscriber created', { id: subscriber.id, email: subscriber.email });
    res.status(201).json(subscriber);
  } catch (error) {
    logger.error('Error creating subscriber', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to create subscriber' });
  }
};

export const getSubscribers = async (req: Request, res: Response): Promise<void> => {
  const { active_only = 'true' } = req.query;

  try {
    let query = db.select().from(subscribers).orderBy(desc(subscribers.created_at));

    if (active_only === 'true') {
      query = query.where(eq(subscribers.is_active, true)) as any;
    }

    const subscribersList = await query;

    res.json(subscribersList || []);
  } catch (error) {
    logger.error('Error fetching subscribers', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
};

export const getSubscriber = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const [subscriber] = await db.select().from(subscribers).where(eq(subscribers.id, parseInt(id))).limit(1);

    if (!subscriber) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    const subscriberSubscriptions = await db
      .select({
        topic_id: subscriptions.topic_id,
        topic: {
          id: topics.id,
          name: topics.name,
        },
      })
      .from(subscriptions)
      .innerJoin(topics, eq(subscriptions.topic_id, topics.id))
      .where(eq(subscriptions.subscriber_id, subscriber.id));

    const topicsList = subscriberSubscriptions.map((sub) => ({
      id: sub.topic.id,
      name: sub.topic.name,
    }));

    res.json({
      ...subscriber,
      topics: topicsList,
    });
  } catch (error) {
    logger.error('Error fetching subscriber', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to fetch subscriber' });
  }
};

export const deleteSubscriber = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const [subscriber] = await db.update(subscribers)
      .set({ is_active: false })
      .where(eq(subscribers.id, parseInt(id)))
      .returning();

    if (!subscriber) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    logger.info('Subscriber deactivated', { id });
    res.json({ message: 'Subscriber deactivated successfully', subscriber });
  } catch (error) {
    logger.error('Error deleting subscriber', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to delete subscriber' });
  }
};

export const subscribeToTopic = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { topicId } = req.body;

  if (!topicId) {
    res.status(400).json({ error: 'topicId is required' });
    return;
  }

  try {
    const [subscriber] = await db.select()
      .from(subscribers)
      .where(and(
        eq(subscribers.id, parseInt(id)),
        eq(subscribers.is_active, true)
      ))
      .limit(1);

    if (!subscriber) {
      res.status(404).json({ error: 'Subscriber not found or inactive' });
      return;
    }

    const [topic] = await db.select()
      .from(topics)
      .where(eq(topics.id, topicId))
      .limit(1);

    if (!topic) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    const [subscription] = await db.insert(subscriptions).values({
      subscriber_id: parseInt(id),
      topic_id: topicId,
    }).returning();

    logger.info('Subscriber subscribed to topic', { subscriberId: id, topicId });
    res.status(201).json(subscription);
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Already subscribed to this topic' });
      return;
    }
    logger.error('Error subscribing to topic', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to subscribe to topic' });
  }
};

export const unsubscribeFromTopic = async (req: Request, res: Response): Promise<void> => {
  const { id, topicId } = req.params;

  try {
    const result = await db.delete(subscriptions)
      .where(and(
        eq(subscriptions.subscriber_id, parseInt(id)),
        eq(subscriptions.topic_id, parseInt(topicId))
      ))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }

    logger.info('Subscriber unsubscribed from topic', { subscriberId: id, topicId });
    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    logger.error('Error unsubscribing from topic', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
};
