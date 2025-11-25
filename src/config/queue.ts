import Queue from 'bull';
import logger from './logger.js';

interface EmailJobData {
  contentId: number;
  subscriberId: number;
  subscriberEmail: string;
  title: string;
  body: string;
}

const getRedisConfig = () => {
  if (process.env.REDIS_URL) {
    const url = process.env.REDIS_URL;
    const isTls = url.startsWith('rediss://');
    
    if (isTls) {
      const urlObj = new URL(url);
      return {
        redis: {
          host: urlObj.hostname,
          port: parseInt(urlObj.port || '6379'),
          password: urlObj.password || undefined,
          username: urlObj.username || undefined,
          tls: {},
          connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
          lazyConnect: false,
        },
      };
    }
    
    return {
      redis: url,
    };
  }

  const useTls = process.env.REDIS_TLS === 'true';
  return {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
      lazyConnect: false,
      ...(useTls && {
        tls: {},
      }),
    },
  };
};

const emailQueue = new Queue<EmailJobData>('email-queue', {
  ...getRedisConfig(),
  settings: {
    stalledInterval: 300000,
    maxStalledCount: 1,
    retryProcessDelay: 5000,
    lockDuration: 300000,
    lockRenewTime: 150000,
  },
  defaultJobOptions: {
    attempts: 3,
    timeout: 120000,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 86400,
    },
  },
});

let connectionRetryCount = 0;
const MAX_RETRY_ATTEMPTS = 10;
const RETRY_DELAY_BASE = 2000;

async function checkRedisConnection(): Promise<boolean> {
  try {
    const client = emailQueue.client;
    if (!client) {
      return false;
    }
    const status = client.status;
    return status === 'ready' || status === 'connect';
  } catch (error) {
    return false;
  }
}

async function attemptRedisConnection(): Promise<void> {
  const isConnected = await checkRedisConnection();
  
  if (!isConnected) {
    connectionRetryCount++;
    
    if (connectionRetryCount <= MAX_RETRY_ATTEMPTS) {
      const retryDelay = RETRY_DELAY_BASE * Math.pow(2, Math.min(connectionRetryCount - 1, 5));
      
      logger.warn('Redis not connected, attempting to reconnect', {
        attempt: connectionRetryCount,
        maxAttempts: MAX_RETRY_ATTEMPTS,
        retryDelayMs: retryDelay,
        redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
      });
      
      try {
        const client = emailQueue.client;
        if (client) {
          if (client.status === 'end' || client.status === 'close') {
            if (typeof client.connect === 'function') {
              await client.connect();
            }
          } else {
            await client.ping();
          }
        } else {
          logger.warn('Redis client not available, Bull will attempt reconnection automatically');
        }
      } catch (error) {
        logger.error('Redis reconnection attempt failed', {
          attempt: connectionRetryCount,
          error: (error as Error).message,
          willRetry: connectionRetryCount < MAX_RETRY_ATTEMPTS,
        });
        
        if (connectionRetryCount < MAX_RETRY_ATTEMPTS) {
          setTimeout(() => attemptRedisConnection(), retryDelay);
        } else {
          logger.error('Max Redis reconnection attempts reached', {
            totalAttempts: connectionRetryCount,
            warning: 'Bull will continue attempting automatic reconnection',
          });
        }
      }
    }
  } else {
    if (connectionRetryCount > 0) {
      logger.info('Redis connection restored', {
        totalRetries: connectionRetryCount,
      });
      connectionRetryCount = 0;
    }
  }
}

emailQueue.on('ready', () => {
  connectionRetryCount = 0;
  logger.info('Queue connected to Redis and ready', {
    queueName: 'email-queue',
    redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
  });
});

emailQueue.on('error', (error: Error) => {
  logger.error('Queue error', {
    error: error.message,
    stack: error.stack,
    redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
  });
  
  attemptRedisConnection();
});

emailQueue.on('waiting', (jobId: string | number) => {
  logger.info('Job added to queue (waiting)', { jobId });
});

emailQueue.on('active', (job) => {
  logger.info('Job started processing (active)', {
    jobId: job.id,
    contentId: job.data.contentId,
    subscriberId: job.data.subscriberId,
    subscriberEmail: job.data.subscriberEmail,
  });
});

emailQueue.on('completed', (job, result) => {
  logger.info('Job completed successfully', {
    jobId: job.id,
    contentId: job.data.contentId,
    subscriberId: job.data.subscriberId,
    subscriberEmail: job.data.subscriberEmail,
    messageId: result?.messageId,
  });
});

emailQueue.on('failed', (job, err) => {
  logger.error('Job failed after retries', {
    jobId: job?.id,
    contentId: job?.data?.contentId,
    subscriberId: job?.data?.subscriberId,
    subscriberEmail: job?.data?.subscriberEmail,
    error: err.message,
    attemptsMade: job?.attemptsMade,
  });
});

emailQueue.on('stalled', (job) => {
  logger.warn('Job stalled (taking too long)', {
    jobId: job.id,
    contentId: job.data.contentId,
    subscriberId: job.data.subscriberId,
  });
});

setTimeout(async () => {
  const isConnected = await checkRedisConnection();
  if (!isConnected) {
    logger.warn('Redis connection check failed on startup', {
      willAttemptReconnect: true,
    });
    attemptRedisConnection();
  }
}, 3000);

setInterval(async () => {
  const isConnected = await checkRedisConnection();
  if (!isConnected) {
    logger.warn('Periodic Redis connection check failed', {
      willAttemptReconnect: true,
    });
    attemptRedisConnection();
  }
}, 30000);

export default emailQueue;

