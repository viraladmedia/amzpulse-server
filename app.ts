import express from 'express';
import cors from 'cors';
import { productRoutes, batchRoutes, watchlistRoutes } from './routes';
import dotenv from 'dotenv';
import morgan from 'morgan';
import createRateLimiter from './middleware/rateLimiter';
import startMetricsSync from './jobs/metricsSync';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Global rate limiter (configurable via env)
app.use(createRateLimiter());

// Routes with optional per-route override limits
app.use('/api/products', productRoutes);
// Example: stricter limiter for batch analysis to prevent abuse
app.use('/api/batch', createRateLimiter({ max: Number(process.env.RATE_LIMIT_BATCH_MAX) || 20 }), batchRoutes);
app.use('/api/watchlist', watchlistRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: '2.0.0' });
});

// Centralized error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server with graceful shutdown and start background job
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`AmzPulse Backend v2.0 initialized.`);
    try {
      startMetricsSync();
    } catch (e) {
      console.warn('Failed to start metrics sync job:', e);
    }
  });

  const shutdown = () => {
    console.log('Shutting down server...');
    server.close(() => {
      console.log('Server closed. Exiting.');
      process.exit(0);
    });
    // force exit after timeout
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default app;