import { Router } from 'express';
import * as productController from './controllers/productController';
// import * as watchlistController from './controllers/watchlistController'; // Placeholder

export const productRoutes = Router();
export const batchRoutes = Router();
export const watchlistRoutes = Router();

// --- Product Routes ---
// Get historical data for charts (more specific route first)
productRoutes.get('/:asin/history', productController.getProductHistory);

// Get single product details (fetches live or DB cache)
productRoutes.get('/:asin', productController.getProductDetails);

// --- Batch Routes ---
// Bulk analysis
batchRoutes.post('/analyze', productController.analyzeBatch);

// --- Watchlist Routes ---
// Placeholder for future implementation
watchlistRoutes.get('/', (req, res) => res.json({ message: "List items" }));
watchlistRoutes.post('/', (req, res) => res.json({ message: "Add item" }));