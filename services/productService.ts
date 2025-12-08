import { getProductData } from '../providers/mockProvider';
// In a real app, this would also talk to Prisma to check cache
import prisma from '../prisma/client';
import { cacheGetJSON, cacheSetJSON } from './cacheService';

// Constants
const CACHE_TTL_SEC = 120; // 2 minutes
const DB_FRESH_MS = 1000 * 60 * 5; // consider DB fresh if updated within 5 minutes

// Small helper to transform provider shape -> Prisma/response shape if needed
const normalizeProviderData = (raw: any) => {
  return {
    asin: raw.asin,
    title: raw.title,
    brand: raw.brand,
    category: raw.category,
    price: Number(raw.price || 0),
    bsr: Number(raw.bsr || 0),
    estSales: Number(raw.estSales || raw.estimatedSales || 0),
    sellers: Number(raw.sellers || 0),
    referralFee: Number(raw.referralFee || 0),
    fbaFee: Number(raw.fbaFee || 0),
    weight: raw.weight || null,
    dimensions: raw.dimensions || null,
    isHazmat: !!raw.isHazmat,
    isIpRisk: !!raw.isIpRisk,
    priceHistory: raw.priceHistory || [],
    bsrHistory: raw.bsrHistory || []
  };
};

export const getProductOrFetch = async (asin: string) => {
  const cacheKey = `product:${asin}`;
  // 1. Try Redis
  const cached = await cacheGetJSON<any>(cacheKey);
  if (cached) return cached;

  // 2. Try DB
  const dbProd = await prisma.product.findUnique({
    where: { asin },
    include: {
      metrics: {
        take: 30,
        orderBy: { timestamp: 'desc' }
      }
    }
  });

  if (dbProd) {
    const ageMs = Date.now() - new Date(dbProd.updatedAt).getTime();
    // If DB entry is fresh enough, map and return
    if (ageMs < DB_FRESH_MS) {
      const mapped = {
        asin: dbProd.asin,
        title: dbProd.title,
        brand: dbProd.brand,
        category: dbProd.category,
        price: Number(dbProd.currentPrice),
        bsr: dbProd.currentBsr,
        estSales: dbProd.estSales,
        sellers: dbProd.sellers,
        referralFee: Number(dbProd.referralFee),
        fbaFee: Number(dbProd.fbaFee),
        weight: dbProd.weight,
        dimensions: dbProd.dimensions,
        isHazmat: dbProd.isHazmat,
        isIpRisk: dbProd.isIpRisk,
        priceHistory: dbProd.metrics.map((m: any) => ({ date: m.timestamp.toISOString().split('T')[0], price: Number(m.price) })).reverse(),
        bsrHistory: dbProd.metrics.map((m: any) => ({ date: m.timestamp.toISOString().split('T')[0], rank: m.bsr })).reverse()
      };
      // cache and return
      await cacheSetJSON(cacheKey, mapped, CACHE_TTL_SEC);
      return mapped;
    }
  }

  // 3. Fetch from provider
  const providerRaw: any = await getProductData(asin);
  const live = normalizeProviderData(providerRaw);

  // Persist to DB (upsert)
  try {
    await prisma.product.upsert({
      where: { asin },
      create: {
        asin,
        title: live.title,
        brand: live.brand,
        image: providerRaw.image || '',
        category: live.category,
        currentPrice: live.price,
        currentBsr: Math.floor(live.bsr),
        estSales: Math.floor(live.estSales),
        sellers: live.sellers,
        referralFee: live.referralFee,
        fbaFee: live.fbaFee,
        weight: live.weight || null,
        dimensions: live.dimensions || null,
        isHazmat: live.isHazmat,
        isIpRisk: live.isIpRisk
      },
      update: {
        title: live.title,
        brand: live.brand,
        image: providerRaw.image || '',
        category: live.category,
        currentPrice: live.price,
        currentBsr: Math.floor(live.bsr),
        estSales: Math.floor(live.estSales),
        sellers: live.sellers,
        referralFee: live.referralFee,
        fbaFee: live.fbaFee,
        weight: live.weight || null,
        dimensions: live.dimensions || null,
        isHazmat: live.isHazmat,
        isIpRisk: live.isIpRisk
      }
    });

    // Insert a metric snapshot (latest)
    await prisma.productMetric.create({
      data: {
        productId: asin,
        price: live.price,
        bsr: Math.floor(live.bsr)
      }
    });
  } catch (err) {
    console.warn('Prisma upsert failed:', err);
  }

  // Cache provider response for immediate reuse
  await cacheSetJSON(cacheKey, providerRaw, CACHE_TTL_SEC);

  return providerRaw;
};

export const getHistory = async (asin: string) => {
  // Try to get from Redis first (reuse product cache flow)
  const product = await getProductOrFetch(asin);
  return {
    priceHistory: product.priceHistory,
    bsrHistory: product.bsrHistory
  };
};

export const processBatch = async (asins: string[]) => {
  // Process in parallel with concurrency limit (simple chunking)
  const concurrency = 5;
  const results: any[] = [];
  for (let i = 0; i < asins.length; i += concurrency) {
    const chunk = asins.slice(i, i + concurrency);
    const promises = chunk.map(async (asin) => {
      try {
        return await getProductOrFetch(asin);
      } catch (e) {
        return { asin, error: (e as Error).message || 'Failed to fetch' };
      }
    });
    const resolved = await Promise.all(promises);
    results.push(...resolved);
  }
  return results;
};