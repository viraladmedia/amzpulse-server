import cron from 'node-cron';
import prisma from '../prisma/client';
import { getProductData } from '../providers/mockProvider'; // swap to real provider later

const CRON_SCHEDULE = process.env.SYNC_CRON || '*/15 * * * *'; // every 15 minutes
const BATCH_SIZE = Number(process.env.SYNC_BATCH_SIZE) || 10;
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY) || 3;

// Helper to process chunk with limited concurrency
const processChunk = async (asins: string[]) => {
  const results: any[] = [];
  for (let i = 0; i < asins.length; i += CONCURRENCY) {
    const slice = asins.slice(i, i + CONCURRENCY);
    const promises = slice.map(async (asin) => {
      try {
        const provider = await getProductData(asin);
        // Update product and insert metric snapshot
        await prisma.product.upsert({
          where: { asin },
          create: {
            asin,
            title: provider.title || '',
            brand: provider.brand || null,
            image: provider.image || '',
            category: provider.category || 'Unknown',
            currentPrice: provider.price ?? 0,
            currentBsr: Math.floor(provider.bsr ?? 0),
            estSales: Math.floor(provider.estSales ?? 0),
            sellers: provider.sellers ?? 0,
            referralFee: provider.referralFee ?? 0,
            fbaFee: provider.fbaFee ?? 0,
            weight: provider.weight ?? null,
            dimensions: provider.dimensions ?? null,
            isHazmat: !!provider.isHazmat,
            isIpRisk: !!provider.isIpRisk
          },
          update: {
            title: provider.title || undefined,
            brand: provider.brand || undefined,
            image: provider.image || undefined,
            category: provider.category || undefined,
            currentPrice: provider.price ?? undefined,
            currentBsr: Math.floor(provider.bsr ?? 0),
            estSales: Math.floor(provider.estSales ?? 0),
            sellers: provider.sellers ?? undefined,
            referralFee: provider.referralFee ?? undefined,
            fbaFee: provider.fbaFee ?? undefined,
            weight: provider.weight ?? undefined,
            dimensions: provider.dimensions ?? undefined,
            isHazmat: !!provider.isHazmat,
            isIpRisk: !!provider.isIpRisk
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
        console.warn(`Metrics sync failed for ${asin}:`, err);
        results.push({ asin, ok: false, error: (err as Error).message });
      }
    });

    await Promise.all(promises);
  }

  return results;
};

export const startMetricsSync = () => {
  console.log(`Scheduling metrics sync job: ${CRON_SCHEDULE}`);
  const task = cron.schedule(CRON_SCHEDULE, async () => {
    console.log('Metrics sync started');
    try {
      // Get a page of products to sync (rotate through products in production)
      const products = await prisma.product.findMany({ take: BATCH_SIZE, select: { asin: true } });
      const asins = products.map(p => p.asin);
      if (asins.length === 0) {
        console.log('No products to sync');
        return;
      }
      await processChunk(asins);
      console.log('Metrics sync finished');
    } catch (err) {
      console.error('Metrics sync job error:', err);
    }
  });

  task.start();
  return task;
};

export default startMetricsSync;
