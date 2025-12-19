import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../config';

test('loadConfig falls back to defaults', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.port, 3001);
  assert.equal(cfg.rateLimit.max, 100);
  assert.equal(cfg.enableMetricsSync, false);
  assert.ok(cfg.jwtSecret.length > 0);
});

test('loadConfig respects environment overrides', () => {
  const cfg = loadConfig({
    PORT: '4000',
    RATE_LIMIT_MAX: '5',
    ENABLE_METRICS_SYNC: 'true',
    CACHE_TTL_SECONDS: '10'
  } as any);

  assert.equal(cfg.port, 4000);
  assert.equal(cfg.rateLimit.max, 5);
  assert.equal(cfg.enableMetricsSync, true);
  assert.equal(cfg.cacheTtlSeconds, 10);
});

