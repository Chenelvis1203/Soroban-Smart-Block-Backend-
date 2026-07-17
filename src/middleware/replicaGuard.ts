import { Request, Response, NextFunction } from 'express';
import { getReadClient, measureReplicaLag, LAG_THRESHOLD_LEDGERS } from '../db/replicaGateway';

/**
 * Attaches the appropriate Prisma read client to `res.locals.db`.
 *
 * If the replica lags the primary by more than LAG_THRESHOLD_LEDGERS ledgers
 * (~10 s), `res.locals.db` is set to the primary write client so that
 * critical frontend reads are never served stale data.
 */
export async function replicaGuard(req: Request, res: Response, next: NextFunction) {
  try {
    res.locals.db = await getReadClient();
    const lag = await measureReplicaLag();
    if (lag > LAG_THRESHOLD_LEDGERS) {
      res.setHeader('X-Replica-Fallback', 'true');
      res.setHeader('X-Replica-Lag-Ledgers', String(lag));
    }
  } catch {
    // Never block a request due to lag-check failure
  }
  next();
}
