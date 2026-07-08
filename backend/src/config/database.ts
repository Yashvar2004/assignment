import { PrismaClient } from '@prisma/client';
import { config } from './index';

const prisma = new PrismaClient({
  log: config.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: config.database.url,
    },
  },
});

export default prisma;

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
