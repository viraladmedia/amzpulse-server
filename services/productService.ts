import prisma from '../prisma/client';
import { cacheGetJSON, cacheSetJSON } from './cacheService';
import { config } from '../config';
import logger from '../lib/logger';
import { getExternalProduct } from './externalProductClient';

// Small helper to transform provider shape -> Prisma/response shape if needed
const normalizeProviderData = (raw: any) => {
  return {
    asin: raw.asin,
    title: raw.title,
    brand: raw.brand,
    category: raw.category,
    subCategory: raw.subCategory,
    price: Number(raw.price || 0),
    image: raw.image || `https://picsum.photos/seed/${raw.asin}/400/400`,
    bsr: Number(raw.bsr || 0),
    estSales: Number(raw.estSales || raw.estimatedSales || 0),
    sellers: Number(raw.sellers || 0),
    referralFee: Number(raw.referralFee || 0),
    fbaFee: Number(raw.fbaFee || 0),
    storageFee: Number(raw.storageFee || 0.55),
    weight: raw.weight || null,
    dimensions: raw.dimensions || null,
    isHazmat: !!raw.isHazmat,
    isIpRisk: !!raw.isIpRisk,
    isOversized: !!raw.isOversized,
    rating: Number(raw.rating || 0),
    reviews: Number(raw.reviews || 0),
    trend: Number(raw.trend || 0),
    description: raw.description || '',
    seasonalityTags: raw.seasonalityTags || ['Evergreen'],
    analysis: raw.analysis || null,
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
  let dbProd: any | null = null;
  try {
    dbProd = await prisma.product.findUnique({
      where: { asin },
      include: {
        metrics: {
          take: 30,
          orderBy: { timestamp: 'desc' }
        }
      }
    });
  } catch (err) {
    logger.warn('Database unavailable when fetching product, falling back to provider', { error: err });
  }

  if (dbProd) {
    const ageMs = Date.now() - new Date(dbProd.updatedAt).getTime();
    // If DB entry is fresh enough, map and return
    if (ageMs < config.dbFreshMs) {
      const tags = Array.isArray(dbProd.seasonalityTags) ? dbProd.seasonalityTags : ['Evergreen'];
      const mapped = {
        asin: dbProd.asin,
        title: dbProd.title,
        brand: dbProd.brand,
        category: dbProd.category,
        subCategory: dbProd.subCategory,
        image: dbProd.image,
        price: Number(dbProd.currentPrice),
        bsr: dbProd.currentBsr,
        estSales: dbProd.estSales,
        sellers: dbProd.sellers,
        referralFee: Number(dbProd.referralFee),
        fbaFee: Number(dbProd.fbaFee),
        storageFee: dbProd.storageFee ? Number(dbProd.storageFee) : 0.55,
        rating: dbProd.rating ? Number(dbProd.rating) : 0,
        reviews: dbProd.reviews ?? 0,
        trend: dbProd.trend ?? 0,
        description: dbProd.description || '',
        seasonalityTags: tags,
        weight: dbProd.weight,
        dimensions: dbProd.dimensions,
        isHazmat: dbProd.isHazmat,
        isIpRisk: dbProd.isIpRisk,
        isOversized: dbProd.isOversized,
        priceHistory: dbProd.metrics.map((m: any) => ({ date: m.timestamp.toISOString().split('T')[0], price: Number(m.price) })).reverse(),
        bsrHistory: dbProd.metrics.map((m: any) => ({ date: m.timestamp.toISOString().split('T')[0], rank: m.bsr })).reverse()
      };
      // cache and return
      await cacheSetJSON(cacheKey, mapped, config.cacheTtlSeconds);
      return mapped;
    }
  }

  // 3. Fetch from provider
  const providerRaw: any = await getExternalProduct(asin);
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
        subCategory: live.subCategory,
        rating: live.rating || null,
        reviews: live.reviews || null,
        trend: live.trend || null,
        storageFee: live.storageFee || null,
        description: live.description || null,
        seasonalityTags: live.seasonalityTags || null,
        currentPrice: live.price,
        currentBsr: Math.floor(live.bsr),
        estSales: Math.floor(live.estSales),
        sellers: live.sellers,
        referralFee: live.referralFee,
        fbaFee: live.fbaFee,
        weight: live.weight || null,
        dimensions: live.dimensions || null,
        isHazmat: live.isHazmat,
        isIpRisk: live.isIpRisk,
        isOversized: live.isOversized
      },
      update: {
        title: live.title,
        brand: live.brand,
        image: providerRaw.image || '',
        category: live.category,
        subCategory: live.subCategory,
        rating: live.rating || undefined,
        reviews: live.reviews || undefined,
        trend: live.trend || undefined,
        storageFee: live.storageFee || undefined,
        description: live.description || undefined,
        seasonalityTags: live.seasonalityTags || undefined,
        currentPrice: live.price,
        currentBsr: Math.floor(live.bsr),
        estSales: Math.floor(live.estSales),
        sellers: live.sellers,
        referralFee: live.referralFee,
        fbaFee: live.fbaFee,
        weight: live.weight || null,
        dimensions: live.dimensions || null,
        isHazmat: live.isHazmat,
        isIpRisk: live.isIpRisk,
        isOversized: live.isOversized
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
    logger.warn('Prisma upsert failed', { error: err });
  }

  // Cache provider response for immediate reuse
  await cacheSetJSON(cacheKey, live, config.cacheTtlSeconds);

  return live;
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
