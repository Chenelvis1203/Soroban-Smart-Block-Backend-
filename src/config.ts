import dotenv from 'dotenv';
import { getProfile, type NetworkProfile } from './profiles';

// Load the profile-specific env file first, then fall back to .env
const network = process.env.STELLAR_NETWORK ?? 'testnet';
dotenv.config({ path: `.env.${network}` });
dotenv.config(); // base .env fills any remaining gaps

const profile: NetworkProfile = getProfile(network);

export const config = {
  // ── Server ───────────────────────────────────────────────────────────────
  port:    parseInt(process.env.PORT ?? '3000'),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // ── Active network profile ────────────────────────────────────────────────
  profile,
  stellarNetwork:    profile.name,
  stellarRpcUrl:     profile.rpcUrl,
  stellarRpcWsUrl:   profile.rpcWsUrl,
  horizonUrl:        profile.horizonUrl,
  networkPassphrase: profile.networkPassphrase,
  apiSubdomain:      profile.apiSubdomain,
  cacheUrl:          profile.cacheUrl,

  // ── Database (resolved from profile) ─────────────────────────────────────
  databaseUrl:    profile.databaseUrl,
  readReplicaUrl: profile.readReplicaUrl,

  // ── Indexer ───────────────────────────────────────────────────────────────
  indexerStartLedger:    parseInt(process.env.INDEXER_START_LEDGER    ?? '0'),
  indexerPollIntervalMs: parseInt(process.env.INDEXER_POLL_INTERVAL_MS ?? '5000'),
  indexerBatchSize:      parseInt(process.env.INDEXER_BATCH_SIZE       ?? '100'),
  indexerCatchupWorkers: Math.max(1, parseInt(process.env.INDEXER_CATCHUP_WORKERS ?? '4')),

  // ── Rate limiting ─────────────────────────────────────────────────────────
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000'),
  rateLimitMax:      parseInt(process.env.RATE_LIMIT_MAX        ?? '100'),
  rateLimitPublicMax: parseInt(process.env.RATE_LIMIT_PUBLIC_MAX ?? '100'),
  rateLimitDeveloperMax: parseInt(process.env.RATE_LIMIT_DEVELOPER_MAX ?? '300'),
  rateLimitPremiumMax: parseInt(process.env.RATE_LIMIT_PREMIUM_MAX ?? '1000'),
  rateLimitPublicWindowMs: parseInt(process.env.RATE_LIMIT_PUBLIC_WINDOW_MS ?? '60000'),
  rateLimitDeveloperWindowMs: parseInt(process.env.RATE_LIMIT_DEVELOPER_WINDOW_MS ?? '60000'),
  rateLimitPremiumWindowMs: parseInt(process.env.RATE_LIMIT_PREMIUM_WINDOW_MS ?? '60000'),
  rateLimitAdaptiveEnabled: process.env.RATE_LIMIT_ADAPTIVE_ENABLED !== 'false',
  rateLimitAdaptiveThreshold: parseFloat(process.env.RATE_LIMIT_ADAPTIVE_THRESHOLD ?? '0.85'),
  rateLimitAdaptiveMultiplier: parseFloat(process.env.RATE_LIMIT_ADAPTIVE_MULTIPLIER ?? '0.75'),
};
