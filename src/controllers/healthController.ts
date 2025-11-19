import { Request, Response } from 'express';
import db from '../config/database.js';
import { topics } from '../models/schema.js';
import logger from '../config/logger.js';

export const getHealth = async (_req: Request, res: Response): Promise<void> => {
  try {
    await db.select({ id: topics.id }).from(topics).limit(1);
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Health check failed', { error: (error as Error).message });
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: (error as Error).message,
    });
  }
};

