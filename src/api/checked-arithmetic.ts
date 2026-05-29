/**
 * Checked Arithmetic API Endpoints
 *
 * Provides REST endpoints for querying and analyzing checked arithmetic operations.
 */

import { Router, Request, Response } from 'express';
import {
  analyzeCheckedArithmeticPatterns,
  identifyOverflowSafeContracts,
  generateCheckedArithmeticReport,
} from '../indexer/checked-arithmetic-integration';
import { prismaRead as prisma } from '../db';

const router = Router();

/**
 * GET /api/v1/checked-arithmetic/operations
 *
 * List checked arithmetic operations with optional filtering.
 * Query params:
 *   - contractAddress: filter by contract
 *   - operationType: 'checked_add' | 'checked_sub' | 'checked_mul' | 'checked_pow'
 *   - operandType: 'i256' | 'u256'
 *   - overflowOnly: true to show only overflow cases
 *   - ledgerMin, ledgerMax: ledger range
 *   - limit: max results (default 50, max 500)
 *   - offset: pagination offset
 */
router.get('/operations', async (req: Request, res: Response) => {
  try {
    const {
      contractAddress,
      operationType,
      operandType,
      overflowOnly,
      ledgerMin,
      ledgerMax,
      limit = 50,
      offset = 0,
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit as string) || 50, 500);
    const parsedOffset = parseInt(offset as string) || 0;

    // Build filter conditions
    const where: Record<string, unknown> = {
      functionName: {
        in: [
          'checked_add_i256',
          'checked_add_u256',
          'checked_sub_i256',
          'checked_sub_u256',
          'checked_mul_i256',
          'checked_mul_u256',
          'checked_pow_i256',
          'checked_pow_u256',
        ],
      },
    };

    if (contractAddress) {
      where.contractAddress = contractAddress;
    }

    if (operationType) {
      where.functionName = {
        in: [
          `checked_${operationType}_i256`,
          `checked_${operationType}_u256`,
        ],
      };
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

    // Filter by operand type and overflow status if requested
    let filtered = transactions;

    if (operandType || overflowOnly) {
      filtered = transactions.filter((tx) => {
        if (!tx.functionArgs || typeof tx.functionArgs !== 'object') return false;

        const args = tx.functionArgs as Record<string, unknown>;
        const checkedArith = args._checkedArithmetic as Record<string, unknown> | undefined;

        if (operandType && checkedArith?.operandType !== operandType) {
          return false;
        }

        if (overflowOnly && !checkedArith?.overflowDetected) {
          return false;
        }

        return true;
      });
    }

    // Format response
    const data = filtered.map((tx) => {
      const args = (tx.functionArgs || {}) as Record<string, unknown>;
      const checkedArith = args._checkedArithmetic as Record<string, unknown> | undefined;

      return {
        transactionHash: tx.hash,
        contractAddress: tx.contractAddress,
        functionName: tx.functionName,
        ledgerSequence: tx.ledgerSequence,
        ledgerCloseTime: tx.ledgerCloseTime,
        operation: checkedArith?.operation,
        operandType: checkedArith?.operandType,
        operands: checkedArith?.operands,
        result: checkedArith?.result,
        overflowDetected: checkedArith?.overflowDetected,
        humanReadable: checkedArith?.humanReadable,
      };
    });

    res.json({
      data,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: filtered.length,
      },
    });
  } catch (error) {
    console.error('Error fetching checked arithmetic operations:', error);
    res.status(500).json({ error: 'Failed to fetch checked arithmetic operations' });
  }
});

/**
 * GET /api/v1/checked-arithmetic/operations/:txHash
 *
 * Get detailed analysis for a specific checked arithmetic transaction.
 */
router.get('/operations/:txHash', async (req: Request, res: Response) => {
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

    const checkedFunctions = [
      'checked_add_i256',
      'checked_add_u256',
      'checked_sub_i256',
      'checked_sub_u256',
      'checked_mul_i256',
      'checked_mul_u256',
      'checked_pow_i256',
      'checked_pow_u256',
    ];

    if (!checkedFunctions.includes(tx.functionName || '')) {
      return res.status(400).json({ error: 'Transaction is not a checked arithmetic operation' });
    }

    const args = (tx.functionArgs || {}) as Record<string, unknown>;
    const checkedArith = args._checkedArithmetic as Record<string, unknown> | undefined;

    res.json({
      transactionHash: tx.hash,
      contractAddress: tx.contractAddress,
      functionName: tx.functionName,
      ledgerSequence: tx.ledgerSequence,
      ledgerCloseTime: tx.ledgerCloseTime,
      analysis: checkedArith || null,
    });
  } catch (error) {
    console.error('Error fetching checked arithmetic details:', error);
    res.status(500).json({ error: 'Failed to fetch checked arithmetic details' });
  }
});

/**
 * GET /api/v1/checked-arithmetic/contracts/:contractAddress/operations
 *
 * Get all checked arithmetic operations for a specific contract.
 */
router.get('/contracts/:contractAddress/operations', async (req: Request, res: Response) => {
  try {
    const { contractAddress } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const parsedLimit = Math.min(parseInt(limit as string) || 100, 500);
    const parsedOffset = parseInt(offset as string) || 0;

    const transactions = await prisma.transaction.findMany({
      where: {
        contractAddress,
        functionName: {
          in: [
            'checked_add_i256',
            'checked_add_u256',
            'checked_sub_i256',
            'checked_sub_u256',
            'checked_mul_i256',
            'checked_mul_u256',
            'checked_pow_i256',
            'checked_pow_u256',
          ],
        },
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

    const data = transactions.map((tx) => {
      const args = (tx.functionArgs || {}) as Record<string, unknown>;
      const checkedArith = args._checkedArithmetic as Record<string, unknown> | undefined;

      return {
        transactionHash: tx.hash,
        functionName: tx.functionName,
        ledgerSequence: tx.ledgerSequence,
        ledgerCloseTime: tx.ledgerCloseTime,
        operation: checkedArith?.operation,
        operandType: checkedArith?.operandType,
        operands: checkedArith?.operands,
        result: checkedArith?.result,
        overflowDetected: checkedArith?.overflowDetected,
      };
    });

    res.json({
      contractAddress,
      data,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: data.length,
      },
    });
  } catch (error) {
    console.error('Error fetching contract checked arithmetic operations:', error);
    res.status(500).json({ error: 'Failed to fetch contract checked arithmetic operations' });
  }
});

/**
 * GET /api/v1/checked-arithmetic/patterns
 *
 * Analyze checked arithmetic patterns across the network.
 * Query params:
 *   - ledgerMin, ledgerMax: ledger range (required)
 */
router.get('/patterns', async (req: Request, res: Response) => {
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

    const patterns = await analyzeCheckedArithmeticPatterns(start, end);

    res.json({
      ledgerRange: { start, end },
      patterns: {
        totalCheckedOperations: patterns.totalCheckedOperations,
        overflowCount: patterns.overflowCount,
        successCount: patterns.successCount,
        overflowRate:
          patterns.totalCheckedOperations > 0
            ? (patterns.overflowCount / patterns.totalCheckedOperations) * 100
            : 0,
        contractsUsing: patterns.contractsUsing.size,
        operationTypes: patterns.operationTypes,
      },
    });
  } catch (error) {
    console.error('Error analyzing checked arithmetic patterns:', error);
    res.status(500).json({ error: 'Failed to analyze checked arithmetic patterns' });
  }
});

/**
 * GET /api/v1/checked-arithmetic/overflow-safe-contracts
 *
 * Identify contracts that handle arithmetic overflows safely.
 * Query params:
 *   - minOverflowCount: minimum overflow count to include (default 1)
 */
router.get('/overflow-safe-contracts', async (req: Request, res: Response) => {
  try {
    const { minOverflowCount = 1 } = req.query;

    const min = parseInt(minOverflowCount as string) || 1;
    const contracts = await identifyOverflowSafeContracts(min);

    res.json({
      minOverflowCount: min,
      count: contracts.length,
      contracts,
    });
  } catch (error) {
    console.error('Error identifying overflow-safe contracts:', error);
    res.status(500).json({ error: 'Failed to identify overflow-safe contracts' });
  }
});

/**
 * GET /api/v1/checked-arithmetic/report
 *
 * Generate a comprehensive report on checked arithmetic usage.
 * Query params:
 *   - ledgerMin, ledgerMax: ledger range (required)
 */
router.get('/report', async (req: Request, res: Response) => {
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

    const report = await generateCheckedArithmeticReport(start, end);

    res.json(report);
  } catch (error) {
    console.error('Error generating checked arithmetic report:', error);
    res.status(500).json({ error: 'Failed to generate checked arithmetic report' });
  }
});

export default router;
