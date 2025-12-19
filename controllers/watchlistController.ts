import { Request, Response } from 'express';
import prisma from '../prisma/client';
import { getProductOrFetch } from '../services/productService';
import logger from '../lib/logger';

export const listWatchlist = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const items = await prisma.watchlistItem.findMany({
    where: { organizationId: req.user.organizationId },
    include: { product: true }
  });

  return res.json(items);
};

export const addToWatchlist = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { asin, targetPrice, targetRoi, notes } = req.body;
  if (!asin || typeof asin !== 'string') {
    return res.status(400).json({ error: 'ASIN is required' });
  }

  try {
    const product = await getProductOrFetch(asin);
    const item = await prisma.watchlistItem.upsert({
      where: {
        organizationId_productId: {
          organizationId: req.user.organizationId,
          productId: asin
        }
      },
      create: {
        productId: asin,
        userId: req.user.userId,
        organizationId: req.user.organizationId,
        targetPrice,
        targetRoi,
        notes
      },
      update: {
        targetPrice,
        targetRoi,
        notes
      }
    });

    return res.status(201).json({ asin, product, watchlistItem: { id: item.id, targetPrice: item.targetPrice, targetRoi: item.targetRoi, notes: item.notes } });
  } catch (err) {
    logger.warn('Failed to add to watchlist', { error: err });
    return res.status(400).json({ error: 'Could not add to watchlist' });
  }
};

export const removeFromWatchlist = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { idOrAsin } = req.params;

  await prisma.watchlistItem.deleteMany({
    where: {
      organizationId: req.user.organizationId,
      OR: [{ id: idOrAsin }, { productId: idOrAsin }]
    }
  });
  return res.status(204).send();
};
