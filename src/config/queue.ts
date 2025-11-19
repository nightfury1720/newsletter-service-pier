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
      ...(useTls && {
        tls: {},
      }),
    },
  };
};

const emailQueue = new Queue<EmailJobData>('email-queue', {
  ...getRedisConfig(),
  defaultJobOptions: {
    attempts: 3,
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

emailQueue.on('error', (error: Error) => {
  logger.error('Queue error', { error: error.message });
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

export default emailQueue;

