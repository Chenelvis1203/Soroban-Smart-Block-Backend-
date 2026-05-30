/**
 * Protocol 26 State Extension API Endpoints
 *
 * Provides REST endpoints for querying and analyzing state extension behavior.
 */

import { Router, Request, Response } from 'express';
import {
  analyzeStateExtension,
  generateStateExtensionMetrics,
  identifyProblematicContracts,
  StateExtensionAnalysis,
  StateExtensionMetrics,
} from '../indexer/protocol26-state-extension-analyzer';
import { prismaRead as prisma } from '../db';
import { xdr } from '@stellar/stellar-sdk';

const router = Router();

/**
 * GET /api/v1/protocol26/state-extensions
 *
 * List state extension transactions with optional filtering.
 * Query params:
 *   - contractAddress: filter by contract
 *   - ledgerMin, ledgerMax: ledger range
 *   - complianceStatus: 'compliant' | 'warning' | 'violation'
 *   - clampingTightness: 'loose' | 'moderate' | 'tight' | 'extreme'
 *   - limit: max results (default 50, max 500)
 *   - offset: pagination offset
 */
router.get('/state-extensions', async (req: Request, res: Response) => {
  try {
    const {
      contractAddress,
      ledgerMin,
      ledgerMax,
      complianceStatus,
      clampingTightness,
      limit = 50,
      offset = 0,
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit as string) || 50, 500);
    const parsedOffset = parseInt(offset as string) || 0;

    // Build filter conditions
    const where: Record<string, unknown> = {
      functionName: { in: ['extend_to', 'min_extension', 'max_extension'] },
    };

    if (contractAddress) {
      where.contractAddress = contractAddress;
    }

    if (ledgerMin || ledgerMax) {
      where.ledgerSequence = {};
      if (ledgerMin) {
        (where.ledgerSequence as Record<string, unknown>).gte = parseInt(ledgerMin as string);
      }
      if (ledgerMax) {
        (where.ledgerSequence as Record<string, unknown>).lte = parseInt(ledgerMax as string);
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      select: {
        hash: true,
        contractAddress: true,
        functionName: true,
        functionArgs: true,
        ledgerSequence: true,
        ledgerCloseTime: true,
      },
      orderBy: { ledgerSequence: 'desc' },
      take: parsedLimit,
      skip: parsedOffset,
    });

    // Filter by compliance/clamping if requested
    let filtered = transactions;

    if (complianceStatus || clampingTightness) {
      filtered = transactions.filter((tx) => {
        if (!tx.functionArgs || typeof tx.functionArgs !== 'object') return false;

        const args = tx.functionArgs as Record<string, unknown>;
        const analysis = args._analysis as Record<string, unknown> | undefined;

        if (complianceStatus && analysis?.equityMetrics) {
          const metrics = analysis.equityMetrics as Record<string, unknown>;
          if (metrics.complianceStatus !== complianceStatus) return false;
        }

        if (clampingTightness && analysis?.clampingAnalysis) {
          const clamping = analysis.clampingAnalysis as Record<string, unknown>;
          if (clamping.clampingTightness !== clampingTightness) return false;
        }

        return true;
      });
    }

    res.json({
      data: filtered,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: filtered.length,
      },
    });
  } catch (error) {
    console.error('Error fetching state extensions:', error);
    res.status(500).json({ error: 'Failed to fetch state extensions' });
  }
});

/**
 * GET /api/v1/protocol26/state-extensions/:txHash
 *
 * Get detailed analysis for a specific state extension transaction.
 */
router.get('/state-extensions/:txHash', async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params;

    const tx = await prisma.transaction.findUnique({
      where: { hash: txHash },
      select: {
        hash: true,
        contractAddress: true,
        functionName: true,
        functionArgs: true,
        ledgerSequence: true,
        ledgerCloseTime: true,
      },
    });

    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (!['extend_to', 'min_extension', 'max_extension'].includes(tx.functionName || '')) {
      return res.status(400).json({ error: 'Transaction is not a state extension call' });
    }

    // Extract analysis from stored data
    let analysis: Partial<StateExtensionAnalysis> = {
      contractAddress: tx.contractAddress || undefined,
      transactionHash: tx.hash,
      ledgerSequence: tx.ledgerSequence,
      ledgerCloseTime: tx.ledgerCloseTime,
    };

    if (tx.functionArgs && typeof tx.functionArgs === 'object') {
      const args = tx.functionArgs as Record<string, unknown>;
      const stored = args._analysis as Record<string, unknown> | undefined;

      if (stored) {
        analysis = {
          ...analysis,
          params: {
            extend_to: args.extend_to ? BigInt(args.extend_to as string | number) : undefined,
            min_extension: args.min_extension ? BigInt(args.min_extension as string | number) : undefined,
            max_extension: args.max_extension ? BigInt(args.max_extension as string | number) : undefined,
          },
          extensionRange: stored.extensionRange as any,
          clampingAnalysis: stored.clampingAnalysis as any,
          equityMetrics: stored.equityMetrics as any,
          historicalContext: stored.historicalContext as any,
        };
      }
    }

    res.json(analysis);
  } catch (error) {
    console.error('Error fetching state extension details:', error);
    res.status(500).json({ error: 'Failed to fetch state extension details' });
  }
});

/**
 * GET /api/v1/protocol26/contracts/:contractAddress/state-extensions
 *
 * Get all state extension transactions for a specific contract.
 */
router.get('/contracts/:contractAddress/state-extensions', async (req: Request, res: Response) => {
  try {
    const { contractAddress } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const parsedLimit = Math.min(parseInt(limit as string) || 100, 500);
    const parsedOffset = parseInt(offset as string) || 0;

    const transactions = await prisma.transaction.findMany({
      where: {
        contractAddress,
        functionName: { in: ['extend_to', 'min_extension', 'max_extension'] },
      },
      select: {
        hash: true,
        functionName: true,
        functionArgs: true,
        ledgerSequence: true,
        ledgerCloseTime: true,
      },
      orderBy: { ledgerSequence: 'desc' },
      take: parsedLimit,
      skip: parsedOffset,
    });

    // Extract analysis data
    const enriched = transactions.map((tx) => {
      const args = (tx.functionArgs || {}) as Record<string, unknown>;
      const analysis = args._analysis as Record<string, unknown> | undefined;

      return {
        transactionHash: tx.hash,
        functionName: tx.functionName,
        ledgerSequence: tx.ledgerSequence,
        ledgerCloseTime: tx.ledgerCloseTime,
        analysis: analysis || null,
      };
    });

    res.json({
      contractAddress,
      data: enriched,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: enriched.length,
      },
    });
  } catch (error) {
    console.error('Error fetching contract state extensions:', error);
    res.status(500).json({ error: 'Failed to fetch contract state extensions' });
  }
});

/**
 * GET /api/v1/protocol26/metrics
 *
 * Get aggregate metrics for state extensions across all contracts.
 * Query params:
 *   - ledgerMin, ledgerMax: ledger range (required)
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const { ledgerMin, ledgerMax } = req.query;

    if (!ledgerMin || !ledgerMax) {
      return res.status(400).json({
        error: 'ledgerMin and ledgerMax query parameters are required',
      });
    }

    const start = parseInt(ledgerMin as string);
    const end = parseInt(ledgerMax as string);

    if (isNaN(start) || isNaN(end) || start > end) {
      return res.status(400).json({
        error: 'Invalid ledger range: ledgerMin must be <= ledgerMax',
      });
    }

    const metrics = await generateStateExtensionMetrics(start, end);

    res.json({
      ledgerRange: { start, end },
      metrics,
    });
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

/**
 * GET /api/v1/protocol26/problematic-contracts
 *
 * Identify contracts with concerning extension patterns.
 * Query params:
 *   - threshold: 'tight' | 'extreme' (default: 'extreme')
 */
router.get('/problematic-contracts', async (req: Request, res: Response) => {
  try {
    const { threshold = 'extreme' } = req.query;

    if (!['tight', 'extreme'].includes(threshold as string)) {
      return res.status(400).json({
        error: "threshold must be 'tight' or 'extreme'",
      });
    }

    const problematic = await identifyProblematicContracts(threshold as 'tight' | 'extreme');

    res.json({
      threshold,
      count: problematic.length,
      contracts: problematic,
    });
  } catch (error) {
    console.error('Error identifying problematic contracts:', error);
    res.status(500).json({ error: 'Failed to identify problematic contracts' });
  }
});

/**
 * GET /api/v1/protocol26/equity-report
 *
 * Generate a detailed equity report for state extensions.
 * Query params:
 *   - ledgerMin, ledgerMax: ledger range
 */
router.get('/equity-report', async (req: Request, res: Response) => {
  try {
    const { ledgerMin, ledgerMax } = req.query;

    const where: Record<string, unknown> = {
      functionName: { in: ['extend_to', 'min_extension', 'max_extension'] },
    };

    if (ledgerMin || ledgerMax) {
      where.ledgerSequence = {};
      if (ledgerMin) {
        (where.ledgerSequence as Record<string, unknown>).gte = parseInt(ledgerMin as string);
      }
      if (ledgerMax) {
        (where.ledgerSequence as Record<string, unknown>).lte = parseInt(ledgerMax as string);
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      select: {
        contractAddress: true,
        functionArgs: true,
      },
    });

    // Aggregate equity data
    const contractEquity: Record<
      string,
      {
        extensionCount: number;
        averageFairnessScore: number;
        complianceViolations: number;
        clampingTightness: string;
      }
    > = {};

    for (const tx of transactions) {
      if (!tx.contractAddress) continue;

      if (!contractEquity[tx.contractAddress]) {
        contractEquity[tx.contractAddress] = {
          extensionCount: 0,
          averageFairnessScore: 0,
          complianceViolations: 0,
          clampingTightness: 'loose',
        };
      }

      contractEquity[tx.contractAddress].extensionCount++;

      if (tx.functionArgs && typeof tx.functionArgs === 'object') {
        const args = tx.functionArgs as Record<string, unknown>;
        const analysis = args._analysis as Record<string, unknown> | undefined;

        if (analysis?.equityMetrics) {
          const metrics = analysis.equityMetrics as Record<string, unknown>;
          contractEquity[tx.contractAddress].averageFairnessScore +=
            (metrics.fairnessScore as number) || 0;

          if (metrics.complianceStatus === 'violation') {
            contractEquity[tx.contractAddress].complianceViolations++;
          }
        }

        if (analysis?.clampingAnalysis) {
          const clamping = analysis.clampingAnalysis as Record<string, unknown>;
          contractEquity[tx.contractAddress].clampingTightness =
            (clamping.clampingTightness as string) || 'loose';
        }
      }
    }

    // Normalize averages
    for (const addr in contractEquity) {
      const data = contractEquity[addr];
      if (data.extensionCount > 0) {
        data.averageFairnessScore /= data.extensionCount;
      }
    }

    res.json({
      ledgerRange: ledgerMin || ledgerMax ? { start: ledgerMin, end: ledgerMax } : null,
      contractCount: Object.keys(contractEquity).length,
      contracts: contractEquity,
    });
  } catch (error) {
    console.error('Error generating equity report:', error);
    res.status(500).json({ error: 'Failed to generate equity report' });
  }
});

export default router;
