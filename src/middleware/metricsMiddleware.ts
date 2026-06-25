import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal } from '../metrics';

/**
 * Express middleware that records HTTP request duration and total count
 * using Prometheus histograms/counters.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e9;
    // Normalise dynamic path segments to avoid high-cardinality label explosion
    const route = normaliseRoute(req.route?.path ?? req.path);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    httpRequestDuration.observe(labels, durationMs);
    httpRequestTotal.inc(labels);
  });

  next();
}

/** Replace UUIDs, cuid-like IDs, and numeric IDs with :id placeholder. */
function normaliseRoute(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/c[a-z0-9]{20,}/g, '/:id')
    .replace(/\/\d+/g, '/:id');
}
