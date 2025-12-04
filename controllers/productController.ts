import { Request, Response } from 'express';
import * as productService from '../services/productService';

export const getProductDetails = async (req: Request, res: Response) => {
  try {
    const { asin } = req.params;
    if (!asin) {
      return res.status(400).json({ error: 'ASIN is required' });
    }

    const product = await productService.getProductOrFetch(asin);
    return res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getProductHistory = async (req: Request, res: Response) => {
  try {
    const { asin } = req.params;
    const history = await productService.getHistory(asin);
    return res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const analyzeBatch = async (req: Request, res: Response) => {
  try {
    const { asins } = req.body;
    if (!Array.isArray(asins)) {
      return res.status(400).json({ error: 'Invalid payload: asins must be an array' });
    }

    const results = await productService.processBatch(asins);
    return res.json(results);
  } catch (error) {
    console.error('Batch processing error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};