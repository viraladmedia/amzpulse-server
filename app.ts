import express from 'express';
import cors from 'cors';
import { productRoutes, batchRoutes, watchlistRoutes } from './routes';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/products', productRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/watchlist', watchlistRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: '2.0.0' });
});

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`AmzPulse Backend v2.0 initialized.`);
  });
}

export default app;