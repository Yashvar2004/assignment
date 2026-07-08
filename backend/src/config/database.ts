import { PrismaClient } from '@prisma/client';
import { config } from './index';

// Prisma client singleton for serverless environments
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
  });

if (config.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
