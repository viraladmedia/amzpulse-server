import { getProductData } from '../providers/mockProvider';
// In future: import { getProductData } from '../providers/amazonSpApiProvider';

// In a real app, this would also talk to Prisma to check cache
// import prisma from '../prisma/client'; 

export const getProductOrFetch = async (asin: string) => {
  // 1. Check DB for recent data (pseudo-code)
  // const cached = await prisma.product.findUnique({ where: { asin }});
  // if (cached && isFresh(cached.updatedAt)) return cached;

  // 2. Fetch from Provider
  const liveData = await getProductData(asin);

  // 3. Save to DB (pseudo-code)
  // await prisma.product.upsert({ ... });

  return liveData;
};

export const getHistory = async (asin: string) => {
  // Fetch historical metrics
  const liveData = await getProductData(asin);
  return {
    priceHistory: liveData.priceHistory,
    bsrHistory: liveData.bsrHistory
  };
};

export const processBatch = async (asins: string[]) => {
  // Process in parallel with concurrency limit in real app
  const promises = asins.map(async (asin) => {
    try {
      return await getProductOrFetch(asin);
    } catch (e) {
      return { asin, error: "Failed to fetch" };
    }
  });
  
  return Promise.all(promises);
};