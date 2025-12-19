import cron from 'node-cron';
import prisma from '../prisma/client';
import { getExternalProduct } from '../services/externalProductClient';
import { config } from '../config';
import logger from '../lib/logger';

// Helper to process chunk with limited concurrency
const processChunk = async (asins: string[]) => {
  const results: any[] = [];
  for (let i = 0; i < asins.length; i += config.metrics.concurrency) {
    const slice = asins.slice(i, i + config.metrics.concurrency);
    const promises = slice.map(async (asin) => {
      try {
        const provider = await getExternalProduct(asin);
        // Update product and insert metric snapshot
        await prisma.product.upsert({
          where: { asin },
          create: {
            asin,
            title: provider.title || '',
            brand: provider.brand || null,
            image: provider.image || '',
            category: provider.category || 'Unknown',
            subCategory: provider.subCategory || null,
            rating: provider.rating || null,
            reviews: provider.reviews || null,
            trend: provider.trend || null,
            storageFee: provider.storageFee || null,
            description: provider.description || null,
            seasonalityTags: provider.seasonalityTags || null,
            currentPrice: provider.price ?? 0,
            currentBsr: Math.floor(provider.bsr ?? 0),
            estSales: Math.floor(provider.estSales ?? 0),
            sellers: provider.sellers ?? 0,
            referralFee: provider.referralFee ?? 0,
            fbaFee: provider.fbaFee ?? 0,
            weight: provider.weight ?? null,
            dimensions: provider.dimensions ?? null,
            isHazmat: !!provider.isHazmat,
            isIpRisk: !!provider.isIpRisk,
            isOversized: !!provider.isOversized
          },
          update: {
            title: provider.title || undefined,
            brand: provider.brand || undefined,
            image: provider.image || undefined,
            category: provider.category || undefined,
            subCategory: provider.subCategory || undefined,
            rating: provider.rating || undefined,
            reviews: provider.reviews || undefined,
            trend: provider.trend || undefined,
            storageFee: provider.storageFee || undefined,
            description: provider.description || undefined,
            seasonalityTags: provider.seasonalityTags || undefined,
            currentPrice: provider.price ?? undefined,
            currentBsr: Math.floor(provider.bsr ?? 0),
            estSales: Math.floor(provider.estSales ?? 0),
            sellers: provider.sellers ?? undefined,
            referralFee: provider.referralFee ?? undefined,
            fbaFee: provider.fbaFee ?? undefined,
            weight: provider.weight ?? undefined,
            dimensions: provider.dimensions ?? undefined,
            isHazmat: !!provider.isHazmat,
            isIpRisk: !!provider.isIpRisk,
            isOversized: !!provider.isOversized
          }
        });

        await prisma.productMetric.create({
          data: {
            productId: asin,
            price: provider.price ?? 0,
            bsr: Math.floor(provider.bsr ?? 0)
          }
        });

        results.push({ asin, ok: true });
      } catch (err) {
        logger.warn(`Metrics sync failed for ${asin}`, { error: err });
        results.push({ asin, ok: false, error: (err as Error).message });
      }
    });

    await Promise.all(promises);
  }

  return results;
};

export const startMetricsSync = () => {
  if (!config.databaseUrl) {
    logger.warn('Metrics sync disabled: DATABASE_URL not configured');
    return null;
  }

  logger.info(`Scheduling metrics sync job: ${config.metrics.cron}`);
  const task = cron.schedule(config.metrics.cron, async () => {
    logger.info('Metrics sync started');
    try {
      // Get a page of products to sync (rotate through products in production)
      const products = await prisma.product.findMany({ take: config.metrics.batchSize, select: { asin: true } });
      const asins = products.map(p => p.asin);
      if (asins.length === 0) {
        logger.info('No products to sync');
        return;
      }
      await processChunk(asins);
      logger.info('Metrics sync finished');
    } catch (err) {
      logger.error('Metrics sync job error', { error: err });
    }
  });

  task.start();
  return task;
};

export default startMetricsSync;
