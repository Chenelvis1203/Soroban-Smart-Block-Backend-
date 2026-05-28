import { Router, Request, Response } from 'express';
import {
  analyzeUpgradeOrchestration,
  flattenExecutionPath,
  storeUpgradeOrchestration,
} from '../indexer/upgrade-trace-engine';

export const upgradeTraceRouter = Router();

/**
 * GET /api/v1/upgrade-trace/:transactionHash
 * Analyze multi-call upgrade orchestration for a transaction.
 */
upgradeTraceRouter.get('/:transactionHash', async (req: Request, res: Response) => {
  try {
    const { transactionHash } = req.params;

    const orchestration = await analyzeUpgradeOrchestration(transactionHash);

    if (!orchestration) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (!orchestration.isMultiCallUpgrade) {
      return res.json({
        transactionHash,
        isMultiCallUpgrade: false,
        message: 'Not a multi-call upgrade transaction',
      });
    }

    const flatPath = flattenExecutionPath(orchestration);

    // Store metadata
    await storeUpgradeOrchestration(transactionHash, orchestration);

    res.json({
      transactionHash,
      isMultiCallUpgrade: true,
      ledgerSequence: orchestration.ledgerSequence,
      sourceAccount: orchestration.sourceAccount,
      totalSteps: orchestration.totalSteps,
      hasDataMigration: orchestration.hasDataMigration,
      steps: orchestration.steps,
      auxiliaryContracts: orchestration.auxiliaryContracts,
      executionPath: flatPath,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/v1/upgrade-trace/batch
 * Analyze multiple transactions for upgrade orchestration.
 */
upgradeTraceRouter.post('/batch', async (req: Request, res: Response) => {
  try {
    const { transactionHashes } = req.body;

    if (!Array.isArray(transactionHashes)) {
      return res.status(400).json({ error: 'transactionHashes must be an array' });
    }

    const results = await Promise.all(
      transactionHashes.map(async (hash: string) => {
        const orch = await analyzeUpgradeOrchestration(hash);
        return {
          transactionHash: hash,
          isMultiCallUpgrade: orch?.isMultiCallUpgrade || false,
          steps: orch?.steps.length || 0,
          hasDataMigration: orch?.hasDataMigration || false,
        };
      })
    );

    const multiCallUpgrades = results.filter(r => r.isMultiCallUpgrade);

    res.json({
      totalAnalyzed: results.length,
      multiCallUpgradeCount: multiCallUpgrades.length,
      results,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});
