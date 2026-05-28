/**
 * #57 Archived State Eviction Monitor
 *
 * Cron job that cross-references the current ledger sequence against stored
 * liveUntilLedgerSeq boundaries to mark ContractState keys as "Archived" or
 * "Dead", preventing the explorer from showing stale "Live" statuses.
 *
 * - Archived: liveUntilLedgerSeq < currentLedger  (data in cold BucketList)
 * - Dead:     liveUntilLedgerSeq < currentLedger - DEAD_THRESHOLD  (unrecoverable without restore)
 */

import { prismaWrite as prisma } from '../db';
import { getLatestLedger } from './rpc';

/** Ledgers past expiry before a key is considered permanently dead. */
const DEAD_THRESHOLD = 100_000;

/**
 * Run one eviction-monitor sweep.
 * Marks Live keys whose TTL has expired as Archived or Dead.
 * Safe to call repeatedly — uses updateMany (idempotent).
 */
export async function runEvictionMonitor(): Promise<{ archived: number; dead: number }> {
  const currentLedger = await getLatestLedger();

  // Keys that have passed their TTL → Archived
  const archivedResult = await prisma.contractState.updateMany({
    where: {
      status: 'Live',
      liveUntilLedgerSeq: { lt: currentLedger },
    },
    data: { status: 'Archived', updatedAt: new Date() },
  });

  // Keys that are so far past their TTL they are effectively dead
  const deadResult = await prisma.contractState.updateMany({
    where: {
      status: 'Archived',
      liveUntilLedgerSeq: { lt: currentLedger - DEAD_THRESHOLD },
    },
    data: { status: 'Dead', updatedAt: new Date() },
  });

  if (archivedResult.count > 0 || deadResult.count > 0) {
    console.log(
      `[eviction-monitor] ledger ${currentLedger}: ` +
      `${archivedResult.count} → Archived, ${deadResult.count} → Dead`
    );
  }

  return { archived: archivedResult.count, dead: deadResult.count };
}

/**
 * Upsert a ContractState row from a ledger entry TTL observation.
 * Called by the ledger processor whenever it encounters a TTL entry.
 */
export async function upsertContractState(params: {
  contractAddress: string;
  ledgerKey: string;
  keyType: string;
  liveUntilLedgerSeq: number | null;
  currentLedger: number;
}): Promise<void> {
  const { contractAddress, ledgerKey, keyType, liveUntilLedgerSeq, currentLedger } = params;

  const status =
    liveUntilLedgerSeq === null
      ? 'Live'
      : liveUntilLedgerSeq < currentLedger - DEAD_THRESHOLD
      ? 'Dead'
      : liveUntilLedgerSeq < currentLedger
      ? 'Archived'
      : 'Live';

  await prisma.contractState.upsert({
    where: { contractAddress_ledgerKey: { contractAddress, ledgerKey } },
    update: { liveUntilLedgerSeq, status, lastSeenLedger: currentLedger, updatedAt: new Date() },
    create: { contractAddress, ledgerKey, keyType, liveUntilLedgerSeq, status, lastSeenLedger: currentLedger },
  });
}

/**
 * Start the eviction monitor as a recurring background job.
 * @param intervalMs  How often to sweep (default: every 5 minutes)
 */
export function startEvictionMonitor(intervalMs = 5 * 60 * 1000): NodeJS.Timeout {
  console.log(`[eviction-monitor] starting (interval: ${intervalMs}ms)`);
  // Run immediately, then on interval
  runEvictionMonitor().catch((err) => console.error('[eviction-monitor] sweep error:', err));
  return setInterval(() => {
    runEvictionMonitor().catch((err) => console.error('[eviction-monitor] sweep error:', err));
  }, intervalMs);
}
