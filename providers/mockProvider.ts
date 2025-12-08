// This mimics the structure of an external API response (like SP-API or Keepa)

export interface ExternalProductData {
  asin: string;
  title: string;
  brand: string;
  category: string;
  price: number;
  bsr: number;
  estSales: number;
  sellers: number;
  referralFee: number;
  fbaFee: number;
  weight: string;
  dimensions: string;
  isHazmat: boolean;
  isIpRisk: boolean;
  priceHistory: { date: string; price: number }[];
  bsrHistory: { date: string; rank: number }[];
  image?: string; // ADDED: optional image
}

export const getProductData = async (asin: string): Promise<ExternalProductData> => {
  // Simulate network latency
  await new Promise(resolve => setTimeout(resolve, 500));

  const basePrice = Math.random() * 100 + 20;
  const baseBsr = Math.floor(Math.random() * 20000) + 500;

  return {
    asin,
    title: `Mock Product Title for ${asin}`,
    brand: "MockBrand",
    category: "Home & Kitchen",
    price: parseFloat(basePrice.toFixed(2)),
    bsr: baseBsr,
    estSales: Math.floor(500000 / baseBsr),
    sellers: Math.floor(Math.random() * 15) + 1,
    referralFee: parseFloat((basePrice * 0.15).toFixed(2)),
    fbaFee: 5.50,
    weight: "1.2 lbs",
    dimensions: "10x5x2 in",
    isHazmat: Math.random() > 0.9,
    isIpRisk: Math.random() > 0.9,
    priceHistory: generateMockHistory(basePrice, 'price'),
    bsrHistory: generateMockHistory(baseBsr, 'rank'),
    image: `https://picsum.photos/seed/${asin}/400/400` // ADDED: mock image
  };
};

// Helper for history generation (typed overloads)
export function generateMockHistory(baseVal: number, type: 'price'): { date: string; price: number }[];
export function generateMockHistory(baseVal: number, type: 'rank'): { date: string; rank: number }[];
export function generateMockHistory(baseVal: number, type: 'price' | 'rank') {
  const historyDays = 30;
  const now = new Date();

  if (type === 'price') {
    const priceHistory: { date: string; price: number }[] = [];
    for (let i = historyDays; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const fluctuation = (Math.random() - 0.5) * (baseVal * 0.1);
      const val = Math.max(0, baseVal + fluctuation);

      priceHistory.push({ date: dateStr, price: parseFloat(val.toFixed(2)) });
    }
    return priceHistory;
  } else {
    const bsrHistory: { date: string; rank: number }[] = [];
    for (let i = historyDays; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      // BSR fluctuations should be integer and stay >=1
      const fluctuation = (Math.random() - 0.5) * (baseVal * 0.1);
      const val = Math.max(1, baseVal + fluctuation);

      bsrHistory.push({ date: dateStr, rank: Math.floor(val) });
    }
    return bsrHistory;
  }
}