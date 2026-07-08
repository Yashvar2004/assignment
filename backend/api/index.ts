import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '../src/config';
import prisma from '../src/config/database';
import authRoutes from '../src/routes/auth.routes';
import contactRoutes from '../src/routes/contact.routes';
import noteRoutes from '../src/routes/note.routes';
import { errorHandler, notFoundHandler } from '../src/middleware/error-handler';

const app = express();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'https://frontend-cix0d6pet-yash-vardhan-vats-projects.vercel.app',
      'https://frontend-nine-bay-26.vercel.app',
      /\.vercel\.app$/,
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: config.nodeEnv,
      },
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      error: { status: 'unhealthy', message: error.message },
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api', noteRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
