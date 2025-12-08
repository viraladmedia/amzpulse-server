import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redis = new Redis(redisUrl);

// JSON helpers
export const cacheGetJSON = async <T = any>(key: string): Promise<T | null> => {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const cacheSetJSON = async (key: string, value: any, ttlSeconds = 120) => {
  const s = JSON.stringify(value);
  if (ttlSeconds > 0) {
    await redis.set(key, s, 'EX', ttlSeconds);
  } else {
    await redis.set(key, s);
  }
};

export const cacheDel = async (key: string) => {
  await redis.del(key);
};

export default redis;
