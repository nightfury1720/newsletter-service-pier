import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import db from './config/database.js';
import { topics } from './models/schema.js';
import logger from './config/logger.js';
import schedulerService from './services/schedulerService.js';
import './services/queueProcessor.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

let isShuttingDown = false;

const gracefulShutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown...`);

  schedulerService.stop();

  setTimeout(async () => {
    try {
      logger.info('Database connections closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: (error as Error).message });
      process.exit(1);
    }
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

app.listen(PORT, async () => {
  logger.info(`Server started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

  try {
    await db.select({ id: topics.id }).from(topics).limit(1);
    logger.info('Database connection verified');
  } catch (error) {
    const err = error as Error;
    logger.error('Database connection failed', {
      error: err.message,
      stack: err.stack,
      code: (error as any).code,
      errno: (error as any).errno,
      syscall: (error as any).syscall,
      address: (error as any).address,
      port: (error as any).port,
    });
    console.error('Full database error:', error);
  }

  schedulerService.start();
  logger.info('Scheduler service started');
});

export default app;

