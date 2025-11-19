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
  logger.debug('Job waiting', { jobId });
});

emailQueue.on('active', (job) => {
  logger.debug('Job active', { jobId: job.id, data: job.data });
});

emailQueue.on('completed', (job, result) => {
  logger.info('Job completed', { jobId: job.id, result });
});

emailQueue.on('failed', (job, err) => {
  logger.error('Job failed', {
    jobId: job?.id,
    error: err.message,
    data: job?.data,
  });
});

emailQueue.on('stalled', (job) => {
  logger.warn('Job stalled', { jobId: job.id });
});

export default emailQueue;

