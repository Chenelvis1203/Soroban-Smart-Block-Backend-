import { describe, expect, it } from 'vitest';
import { getRateLimitTier, normalizeTierConfig } from '../src/middleware/rateLimit';

describe('rate limit configuration', () => {
  it('falls back to defaults for invalid tier values', () => {
    const config = normalizeTierConfig({
      public: { windowMs: 0, max: -5 },
      developer: { windowMs: 30_000, max: 250 },
      premium: { windowMs: 90_000, max: 5000 },
    } as any);

    expect(config.public.windowMs).toBe(60_000);
    expect(config.public.max).toBe(100);
    expect(config.developer.windowMs).toBe(30_000);
    expect(config.developer.max).toBe(250);
  });

  it('selects the highest matching tier for known API keys', () => {
    const tier = getRateLimitTier('premium-api', new Set(['developer-api']), new Set(['premium-api']));
    expect(tier).toBe('premium');
  });
});
