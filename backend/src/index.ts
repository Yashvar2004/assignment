import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import prisma from './config/database';
import redis from './config/redis';
import authRoutes from './routes/auth.routes';
import contactRoutes from './routes/contact.routes';
import noteRoutes from './routes/note.routes';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import logger from './utils/logger';

const app = express();

// ==================== Middleware ====================

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Request logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== Health Check ====================

app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis connection (optional)
    let redisStatus = 'not available';
    try {
      await redis.ping();
      redisStatus = 'connected';
    } catch {
      // Redis not available, that's OK
    }

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
        database: 'connected',
        redis: redisStatus,
      },
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      error: {
        status: 'unhealthy',
        message: error.message,
      },
    });
  }
});

// ==================== API Routes ====================

app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api', noteRoutes);

// ==================== Error Handling ====================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ==================== Server Startup ====================

// Only start server if not in Vercel serverless environment
if (process.env.VERCEL !== '1') {
  async function startServer() {
    try {
      // Test database connection
      await prisma.$connect();
      logger.info('Database connected successfully');

      // Test Redis connection (optional for development)
      try {
        await redis.connect();
        await redis.ping();
        logger.info('Redis connected successfully');
      } catch (redisError) {
        logger.warn('Redis not available - job queue features will be disabled');
      }

      // Start server
      app.listen(config.port, () => {
        logger.info(`Server running on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`Frontend URL: ${config.frontendUrl}`);
      });
    } catch (error: any) {
      logger.error('Failed to start server', { error: error.message });
      process.exit(1);
    }
  }

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });

  startServer();
}

export default app;
