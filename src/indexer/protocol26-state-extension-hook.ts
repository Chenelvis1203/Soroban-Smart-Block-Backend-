/**
 * Protocol 26 State Extension Hook
 *
 * Integrates state extension analysis into the main indexing pipeline.
 * Automatically analyzes extend_to, min_extension, and max_extension calls
 * as they are indexed.
 */

import { xdr } from '@stellar/stellar-sdk';
import {
  analyzeStateExtension,
  storeStateExtensionAnalysis,
} from './protocol26-state-extension-analyzer';

export interface StateExtensionHookContext {
  contractAddress: string;
  transactionHash: string;
  functionName: string;
  rawArgs: xdr.ScVal[];
  ledgerSequence: number;
  ledgerCloseTime: Date;
}

/**
 * Hook to be called during transaction decoding.
 * Checks if the transaction is a state extension call and analyzes it.
 */
export async function onTransactionDecoded(context: StateExtensionHookContext): Promise<void> {
  const { contractAddress, transactionHash, functionName, rawArgs, ledgerSequence, ledgerCloseTime } =
    context;

  // Only process state extension functions
  if (!['extend_to', 'min_extension', 'max_extension'].includes(functionName)) {
    return;
  }

  try {
    const analysis = await analyzeStateExtension(
      contractAddress,
      transactionHash,
      functionName,
      rawArgs,
      ledgerSequence,
      ledgerCloseTime
    );

    if (analysis) {
      await storeStateExtensionAnalysis(analysis);

      // Log warnings for concerning patterns
      if (analysis.equityMetrics.complianceStatus === 'violation') {
        console.warn(
          `[Protocol26] Compliance violation detected: ${contractAddress} (tx: ${transactionHash})`
        );
      }

      if (analysis.clampingAnalysis.clampingTightness === 'extreme') {
        console.warn(
          `[Protocol26] Extreme clamping detected: ${contractAddress} (ratio: ${analysis.clampingAnalysis.clampingRatio.toFixed(2)})`
        );
      }
    }
  } catch (error) {
    console.error(
      `[Protocol26] Failed to analyze state extension for ${transactionHash}:`,
      error
    );
  }
}

/**
 * Hook to be called during event ingestion.
 * Can detect state extension-related events if needed.
 */
export async function onEventIngested(
  contractAddress: string,
  eventType: string,
  topics: string[],
  data: string
): Promise<void> {
  // Future: Handle state extension-related events
  // For now, this is a placeholder for event-based analysis
}

/**
 * Batch analysis for historical data.
 * Useful for backfilling analysis for existing transactions.
 */
export async function analyzeHistoricalStateExtensions(
  ledgerRangeStart: number,
  ledgerRangeEnd: number
): Promise<{
  processed: number;
  analyzed: number;
  errors: number;
}> {
  const { prismaRead: prisma } = await import('../db');

  let processed = 0;
  let analyzed = 0;
  let errors = 0;

  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        functionName: { in: ['extend_to', 'min_extension', 'max_extension'] },
        ledgerSequence: { gte: ledgerRangeStart, lte: ledgerRangeEnd },
      },
      select: {
        hash: true,
        contractAddress: true,
        functionName: true,
        functionArgs: true,
        ledgerSequence: true,
        ledgerCloseTime: true,
      },
    });

    for (const tx of transactions) {
      processed++;

      try {
        if (!tx.contractAddress || !tx.functionName) {
          continue;
        }

        // Reconstruct rawArgs from stored functionArgs
        // This is a simplified approach; in production, you'd want to store raw XDR
        const rawArgs: xdr.ScVal[] = [];

        if (tx.functionArgs && typeof tx.functionArgs === 'object') {
          const args = tx.functionArgs as Record<string, unknown>;
          // Try to reconstruct ScVal from stored args
          // This is a best-effort approach
          for (const [key, value] of Object.entries(args)) {
            if (key === '_analysis') continue;
            // In a real scenario, you'd need the original XDR or a way to reconstruct it
            // For now, we'll skip this
          }
        }

        const analysis = await analyzeStateExtension(
          tx.contractAddress,
          tx.hash,
          tx.functionName,
          rawArgs,
          tx.ledgerSequence,
          tx.ledgerCloseTime
        );

        if (analysis) {
          await storeStateExtensionAnalysis(analysis);
          analyzed++;
        }
      } catch (error) {
        errors++;
        console.error(`Failed to analyze historical transaction ${tx.hash}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to analyze historical state extensions:', error);
  }

  return { processed, analyzed, errors };
}

/**
 * Real-time monitoring hook.
 * Can be called periodically to check for concerning patterns.
 */
export async function monitorStateExtensionPatterns(): Promise<{
  violationCount: number;
  extremeClampingCount: number;
  affectedContracts: string[];
}> {
  const { prismaRead: prisma } = await import('../db');

  let violationCount = 0;
  let extremeClampingCount = 0;
  const affectedContracts = new Set<string>();

  try {
    // Check recent transactions (last 1000 ledgers)
    const recentTxs = await prisma.transaction.findMany({
      where: {
        functionName: { in: ['extend_to', 'min_extension', 'max_extension'] },
        ledgerSequence: { gte: (await getLatestLedger()) - 1000 },
      },
      select: {
        contractAddress: true,
        functionArgs: true,
      },
    });

    for (const tx of recentTxs) {
      if (!tx.contractAddress) continue;

      if (tx.functionArgs && typeof tx.functionArgs === 'object') {
        const args = tx.functionArgs as Record<string, unknown>;
        const analysis = args._analysis as Record<string, unknown> | undefined;

        if (analysis?.equityMetrics) {
          const metrics = analysis.equityMetrics as Record<string, unknown>;
          if (metrics.complianceStatus === 'violation') {
            violationCount++;
            affectedContracts.add(tx.contractAddress);
          }
        }

        if (analysis?.clampingAnalysis) {
          const clamping = analysis.clampingAnalysis as Record<string, unknown>;
          if (clamping.clampingTightness === 'extreme') {
            extremeClampingCount++;
            affectedContracts.add(tx.contractAddress);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to monitor state extension patterns:', error);
  }

  return {
    violationCount,
    extremeClampingCount,
    affectedContracts: Array.from(affectedContracts),
  };
}

/**
 * Helper to get the latest ledger sequence.
 */
async function getLatestLedger(): Promise<number> {
  const { prismaRead: prisma } = await import('../db');

  const latest = await prisma.ledger.findFirst({
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });

  return latest?.sequence ?? 0;
}
