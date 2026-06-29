import { config } from './config';
import type { RedisClientType } from 'redis';
import { logger } from './logger';

const CACHE_URL = config.cacheUrl ?? 'memory://';
const USE_REDIS = CACHE_URL !== '' && !CACHE_URL.startsWith('memory://');

/**
 * Keys under these prefixes are consistency-sensitive: their values are shared
 * across replicas and must never be served from an independent in-process store.
 * When Redis is configured but unavailable, cacheGet returns null for these keys
 * so callers fall back to the authoritative source rather than stale local state.
 *
 * Keys that permit local fallback (non-exhaustive): abi:, token-meta:, schema:
 * These are derived / re-fetchable and are safe to serve stale within a process.
 */
const CONSISTENCY_SENSITIVE_PREFIXES: readonly string[] = [
  'auth:',
  'session:',
  'ratelimit:',
  'nonce:',
  'token:',
  'apikey:',
];

function isConsistencySensitive(key: string): boolean {
  return CONSISTENCY_SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Returns the namespace prefix of a cache key for log/metric labels. */
function redactKey(key: string): string {
  const colonIdx = key.indexOf(':');
  return colonIdx > 0 ? `${key.slice(0, colonIdx)}:[redacted]` : '[redacted]';
}

interface MemoryEntry {
  payload: string;
  expiresAt: number | null;
}

const memoryStore = new Map<string, MemoryEntry>();
let redisClient: RedisClientType | null = null;
let redisAvailable = false;

function localNow(): number {
  return Date.now();
}

async function getRedisClient(): Promise<RedisClientType | null> {
  if (!USE_REDIS) return null;
  if (redisClient) return redisClient;

  try {
    const { createClient } = await import('redis');
    const client = createClient({ url: CACHE_URL });
    client.on('error', (err: unknown) => {
      logger.error('[cache] Redis client error', { backend: 'redis', error: String(err) });
      redisAvailable = false;
    });
    await client.connect();
    redisClient = client;
    redisAvailable = true;
    logger.info('[cache] Connected to Redis cache', { backend: 'redis' });
    return redisClient;
  } catch (err: unknown) {
    logger.warn('[cache] Could not connect to Redis, falling back to in-memory cache', {
      backend: 'redis',
      error: String(err),
    });
    redisAvailable = false;
    return null;
  }
}

function isExpired(entry: MemoryEntry): boolean {
  return entry.expiresAt !== null && entry.expiresAt <= localNow();
}

function buildExpiry(ttlSeconds: number | null | undefined): number | null {
  if (ttlSeconds === undefined || ttlSeconds === null) return null;
  if (ttlSeconds <= 0) return null;
  return localNow() + ttlSeconds * 1000;
}

export async function cacheConnect(): Promise<void> {
  await getRedisClient();
}

/**
 * Returns true when the cache layer is operational:
 * - always true when using the in-process memory store (no Redis configured)
 * - true only after a successful Redis connection when a Redis URL is configured
 */
export function isCacheReady(): boolean {
  return !USE_REDIS || redisAvailable;
}

/** Returns which backing store is currently in use. */
export function cacheBackendType(): 'redis' | 'memory' {
  return USE_REDIS && redisAvailable ? 'redis' : 'memory';
}

export async function cacheClose(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      await redisClient.disconnect();
    }
    redisClient = null;
    redisAvailable = false;
  }
}

export function cacheClear(): void {
  memoryStore.clear();
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const normalizedKey = key;

  // Consistency-sensitive keys must not be served from the local store when
  // Redis is configured but unavailable — divergent per-process state is incorrect.
  if (USE_REDIS && isConsistencySensitive(normalizedKey) && !redisAvailable) {
    return null;
  }

  const local = memoryStore.get(normalizedKey);
  if (local) {
    if (isExpired(local)) {
      memoryStore.delete(normalizedKey);
    } else {
      try {
        return JSON.parse(local.payload) as T;
      } catch {
        memoryStore.delete(normalizedKey);
      }
    }
  }

  const client = await getRedisClient();
  if (!client) return null;

  try {
    const payload = await client.get(normalizedKey);
    if (!payload) return null;
    const value = JSON.parse(payload) as T;
    memoryStore.set(normalizedKey, { payload, expiresAt: null });
    return value;
  } catch (err) {
    logger.warn('[cache] Failed to read key from Redis', {
      backend: 'redis',
      operation: 'get',
      key: redactKey(normalizedKey),
      error: String(err),
    });
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds?: number | null,
): Promise<void> {
  const normalizedKey = key;
  const payload = JSON.stringify(value);
  memoryStore.set(normalizedKey, {
    payload,
    expiresAt: buildExpiry(ttlSeconds),
  });

  const client = await getRedisClient();
  if (!client) return;

  try {
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(normalizedKey, payload, { EX: ttlSeconds });
    } else {
      await client.set(normalizedKey, payload);
    }
  } catch (err) {
    logger.warn('[cache] Failed to write key to Redis', {
      backend: 'redis',
      operation: 'set',
      key: redactKey(normalizedKey),
      error: String(err),
    });
  }
}

export async function cacheDelete(key: string): Promise<void> {
  const normalizedKey = key;
  memoryStore.delete(normalizedKey);
  const client = await getRedisClient();
  if (!client) return;

  try {
    await client.del(normalizedKey);
  } catch (err) {
    logger.warn('[cache] Failed to delete key from Redis', {
      backend: 'redis',
      operation: 'delete',
      key: redactKey(normalizedKey),
      error: String(err),
    });
  }
}
