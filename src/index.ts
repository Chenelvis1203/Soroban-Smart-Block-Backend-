// OTel SDK must be initialised before any other imports.
import './tracer';

import express from 'express';
import { createServer, Server } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { correlationMiddleware } from './middleware/correlation';
import { config } from './config';
import { router } from './api/router';
import { prismaWrite as prisma, prismaRead } from './db';
import { startIndexerService, stopIndexerService } from './indexer/indexer';
import { tieredRateLimit, initRateLimitStore } from './middleware/rateLimit';
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { sanitizeInputs } from './middleware/sanitize';
import { i18nMiddleware } from './i18n';
import { registry, dbConnectionStatus, cacheBackendStatus } from './metrics';
import { replicaGuard } from './middleware/replicaGuard';
import { coldStorageRouter, initializeColdStorage } from './middleware/coldStorageRouter';
import { networkRouter } from './middleware/networkRouter';
import { swaggerSpec } from './indexer/swaggerSpec';
import { attachWebSocketServer, shutdownWebSocketServer } from './ws/eventBroadcaster';
import { attachPrivacyWebSocket as attachPrivacyWebSocketReal } from './ws/privacyBroadcaster';
import yogaHandler from './graphql';
import { warmTokenMetadataCache } from './indexer/token-metadata';
import { cacheConnect, cacheClose, isCacheReady, cacheBackendType } from './cache';
import { markReady, markNotReady, getReadinessState, isFullyReady } from './readiness';
import { errorHandler } from './middleware/errorHandler';
import { requestContext } from './middleware/requestContext';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import { auditLogMiddleware } from './middleware/auditLog';
import { adminApiKeysRouter } from './api/admin/api-keys';
import { billingRouter } from './api/billing';
import { logger } from './logger';
import { feedOrchestrator } from './feed/orchestrator';
import { startPriceUpdater, stopPriceUpdater } from './services/pricing';
import { startBridgeWorker, stopBridgeWorker } from './bridge-tracker';
import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import { auditLogMiddleware } from './middleware/auditLog';
import { asyncHandler } from './middleware/asyncHandler';
import { rejectUntrustedForwardedHeaders } from './middleware/proxyTrust';
import { billingRouter } from './services/stripe-billing';
import { startArbitrageScanner as startArbitrageScannerImpl } from './indexer/arbitrage-scanner';
import { startPoolPriceMonitor as startPoolPriceMonitorImpl } from './indexer/pool-price-monitor';
import { startFeeAggregator as startFeeAggregatorImpl } from './indexer/fee-aggregator';
import { attachArbitrageWebSocket as attachArbitrageWebSocketImpl } from './ws/arbitrageBroadcaster';
import { attachComposabilityWebSocket as attachComposabilityWebSocketImpl } from './ws/composabilityBroadcaster';

let isShuttingDown = false;
let wssRef: ReturnType<typeof attachWebSocketServer> | null = null;

const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '30000');
const STATE_DUMP_PATH = process.env.STATE_DUMP_PATH ?? './data/state';

// Feature flags — set env var to 'true' to enable each optional service.
const ENABLE_PRIVACY_WS = process.env.ENABLE_PRIVACY_WS === 'true';
const ENABLE_COMPOSABILITY_WS = process.env.ENABLE_COMPOSABILITY_WS === 'true';
const ENABLE_ARBITRAGE_WS = process.env.ENABLE_ARBITRAGE_WS === 'true';
const ENABLE_POOL_MONITOR = process.env.ENABLE_POOL_MONITOR === 'true';
const ENABLE_ARBITRAGE_SCANNER = process.env.ENABLE_ARBITRAGE_SCANNER === 'true';
const ENABLE_FEE_AGGREGATOR = process.env.ENABLE_FEE_AGGREGATOR === 'true';

// Tracks which optional services are disabled, for /readyz reporting.
const disabledServices: string[] = [];

const app = express();
app.set('trust proxy', config.trustProxy);
app.use(rejectUntrustedForwardedHeaders);

app.use(helmet({ contentSecurityPolicy: false }));

// Build an origin allowlist from CORS_ALLOWED_ORIGINS (comma-separated URLs).
// Production requires an explicit list; other envs fall back to '*'.
const corsOrigin: cors.CorsOptions['origin'] = (() => {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (raw) return raw.split(',').map((o) => o.trim());
  if (config.nodeEnv === 'production') return false;
  return '*';
})();

app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-Request-Id'],
    credentials: true,
  }),
);
// Correlation IDs first — requestId is needed by morgan token and logger.
app.use(correlationMiddleware);
morgan.token('request-id', (req) => (req as express.Request).requestId ?? '-');
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms request-id=:request-id'),
);
app.use(express.json());
app.use(networkRouter);

// Request context FIRST (generates requestId + start time for correlation)
app.use(requestContext);

// Auth must resolve before rate limiting so tier is known
app.use(apiKeyAuth);
app.use(tieredRateLimit);
app.use(metricsMiddleware);
app.use(sanitizeInputs);
app.use(i18nMiddleware);
app.use(replicaGuard);
// Audit log captures status + rate limit headers after response
app.use(auditLogMiddleware);

app.use(coldStorageRouter);

// Interactive Swagger UI is disabled in production unless ENABLE_DOCS=true.
// The raw schema endpoints remain available for tooling/codegen in all envs.
const docsEnabled = config.nodeEnv !== 'production' || process.env.ENABLE_DOCS === 'true';
if (docsEnabled) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));
app.get('/api/v1/openapi.json', (_req, res) => res.json(swaggerSpec));

app.use('/api/graphql', yogaHandler as unknown as express.RequestHandler);

app.use('/api/v1', router);
app.use('/api/billing', billingRouter);

app.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  }),
);

app.get('/health', (_req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down' });
  }
  res.json({ status: 'ok', network: config.stellarNetwork });
});

app.get('/readyz', (_req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'not_ready', reason: 'shutting_down' });
  }
  const dependencies = getReadinessState();
  if (!isFullyReady()) {
    return res.status(503).json({ status: 'not_ready', dependencies });
  }
  res.json({ status: 'ready', dependencies });
});

// Readiness probe — returns 503 when the indexer has suffered a fatal failure (#440)
app.get('/ready', (_req, res) => {
  const { healthy, failureReason } = getIndexerStatus();
  if (!healthy) {
    res.status(503).json({ status: 'unavailable', reason: failureReason });
    return;
  }
  res.json({
    status: 'ready',
    ...(disabledServices.length > 0 && { disabledServices }),
  });
});

// Global error handler — MUST be after all routes but BEFORE 404 catch-all
app.use(errorHandler);

// 404 catch-all — only fires when no route matched (not an error)
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

async function saveShutdownState(): Promise<void> {
  try {
    await mkdir(STATE_DUMP_PATH, { recursive: true });
    const state = {
      shutdownTimestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
    await writeFile(
      resolve(STATE_DUMP_PATH, 'shutdown-state.json'),
      JSON.stringify(state, null, 2),
    );
  } catch (err) {
    logger.warn('Failed to save shutdown state', { error: String(err) });
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('[shutdown] Already shutting down, forcing exit');
    process.exit(1);
  }
  isShuttingDown = true;
  logger.info(`[shutdown] Received ${signal}, starting graceful shutdown`);

  const forceExit = setTimeout(() => {
    logger.error(`[shutdown] Forced exit after ${SHUTDOWN_TIMEOUT_MS}ms`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    stopIndexerService();
    logger.info('[shutdown] Indexer service stopped');

    if (wssRef) {
      shutdownWebSocketServer();
      wssRef.close();
      logger.info('[shutdown] WebSocket server closed');
    }

    stopBridgeWorker();
    logger.info('[shutdown] Bridge worker stopped');

    feedOrchestrator.shutdown();
    logger.info('[shutdown] Feed orchestrator stopped');

    stopPriceUpdater();
    logger.info('[shutdown] Price updater stopped');

    await saveShutdownState();
    logger.info('[shutdown] State saved');

    await cacheClose();
    cacheBackendStatus.set(0);
    logger.info('[shutdown] Cache connection closed');

    await prismaRead.$disconnect();
    await prisma.$disconnect();
    dbConnectionStatus.set(0);
    logger.info('[shutdown] Database connections closed');

    clearTimeout(forceExit);
    logger.info('[shutdown] Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('[shutdown] Error during graceful shutdown', { error: String(err) });
    clearTimeout(forceExit);
    process.exit(1);
  }
}

function registerShutdownHandlers(): void {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('[shutdown] Uncaught exception', { error: err.message, stack: err.stack });
    gracefulShutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('[shutdown] Unhandled rejection', { error: String(reason) });
    gracefulShutdown('unhandledRejection');
  });
}

async function main() {
  registerShutdownHandlers();

  await initRateLimitStore();

  await cacheConnect();
  if (isCacheReady()) markReady('cache');
  cacheBackendStatus.set(cacheBackendType() === 'redis' ? 1 : 0);

  await prisma.$connect();
  dbConnectionStatus.set(1);
  markReady('db');

  await initializeColdStorage();
  markReady('coldStorage');

  if (!process.env.DISABLE_INDEXER) {
    markReady('indexer');
    startIndexerService().catch((err) => {
      logger.error('Indexer service failed', { error: String(err) });
      markNotReady('indexer');
    });
    warmTokenMetadataCache().catch((err) =>
      logger.warn('Token-metadata cache warm-up failed', { error: String(err) }),
    );
  } else {
    markReady('indexer');
  }

  const httpServer: Server = createServer(app);
  wssRef = attachWebSocketServer(httpServer);

  if (ENABLE_PRIVACY_WS) {
    attachPrivacyWebSocketReal(httpServer);
    logger.info('Privacy WebSocket attached');
  } else {
    disabledServices.push('privacyWS');
    logger.debug('Privacy WebSocket disabled (ENABLE_PRIVACY_WS not set)');
  }

  if (ENABLE_COMPOSABILITY_WS) {
    try {
      attachComposabilityWebSocketImpl(httpServer);
      logger.info('Composability WebSocket attached');
    } catch (err) {
      logger.warn('Composability WebSocket attachment failed', { error: String(err) });
    }
  } else {
    disabledServices.push('composabilityWS');
    logger.debug('Composability WebSocket disabled (ENABLE_COMPOSABILITY_WS not set)');
  }

  if (ENABLE_ARBITRAGE_WS) {
    try {
      attachArbitrageWebSocketImpl(httpServer);
      logger.info('Arbitrage WebSocket attached');
    } catch (err) {
      logger.warn('Arbitrage WebSocket attachment failed', { error: String(err) });
    }
  } else {
    disabledServices.push('arbitrageWS');
    logger.debug('Arbitrage WebSocket disabled (ENABLE_ARBITRAGE_WS not set)');
  }

  if (!process.env.DISABLE_INDEXER) {
    if (ENABLE_POOL_MONITOR) {
      try {
        startPoolPriceMonitorImpl();
        logger.info('Pool price monitor started');
      } catch (err) {
        logger.warn('Pool price monitor failed to start', { error: String(err) });
      }
    } else {
      disabledServices.push('poolMonitor');
      logger.debug('Pool price monitor disabled (ENABLE_POOL_MONITOR not set)');
    }

    if (ENABLE_ARBITRAGE_SCANNER) {
      try {
        startArbitrageScannerImpl();
        logger.info('Arbitrage scanner started');
      } catch (err) {
        logger.warn('Arbitrage scanner failed to start', { error: String(err) });
      }
    } else {
      disabledServices.push('arbitrageScanner');
      logger.debug('Arbitrage scanner disabled (ENABLE_ARBITRAGE_SCANNER not set)');
    }

    if (ENABLE_FEE_AGGREGATOR) {
      try {
        startFeeAggregatorImpl();
        logger.info('Fee aggregator started');
      } catch (err) {
        logger.warn('Fee aggregator failed to start', { error: String(err) });
      }
    } else {
      disabledServices.push('feeAggregator');
      logger.debug('Fee aggregator disabled (ENABLE_FEE_AGGREGATOR not set)');
    }

    try {
      startBridgeWorker();
    } catch (err) {
      logger.warn('Bridge worker failed to start', { error: String(err) });
    }
  }

  try {
    await startPriceUpdater();
    logger.info('Price updater started');
  } catch (err) {
    logger.warn('Price updater failed to start', { error: String(err) });
  }

  await feedOrchestrator.initialize(httpServer);

  httpServer.listen(config.port, () => {
    logger.info('Soroban Explorer API started', { port: config.port });
  });
}

main().catch((err) => logger.error('Main startup failed', { error: String(err) }));
