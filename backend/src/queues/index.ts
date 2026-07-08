import { Queue } from 'bullmq';
import { config } from '../config';

// Connection options for BullMQ
// Using URL string to avoid ioredis version conflicts
const connectionOptions = {
  connection: {
    url: config.redis.url,
  },
};

// Contact synchronization queue
export const contactSyncQueue = new Queue('contact-sync', {
  ...connectionOptions,
  defaultJobOptions: {
    attempts: config.sync.maxRetryAttempts,
    backoff: {
      type: 'exponential',
      delay: config.sync.retryBackoffBase,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,     // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

// Note synchronization queue
export const noteSyncQueue = new Queue('note-sync', {
  ...connectionOptions,
  defaultJobOptions: {
    attempts: config.sync.maxRetryAttempts,
    backoff: {
      type: 'exponential',
      delay: config.sync.retryBackoffBase,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

// Queue event listeners for logging
contactSyncQueue.on('error', (err) => {
  console.error('Contact sync queue error:', err);
});

noteSyncQueue.on('error', (err) => {
  console.error('Note sync queue error:', err);
});

export default {
  contactSyncQueue,
  noteSyncQueue,
};
