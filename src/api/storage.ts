/**
 * GET /api/v1/storage          — list storage efficiency logs (filterable)
 * GET /api/v1/storage/:txHash  — single log by transaction hash
 */

import { Router, Request, Response } from 'express';
import { prismaRead as prisma } from '../db';
import { z } from 'zod';

export const storageRouter = Router();

const listSchema = z.object({
  contract:    z.string().optional(),
  ledgerMin:   z.coerce.number().int().min(0).optional(),
  ledgerMax:   z.coerce.number().int().min(0).optional(),
  minEfficiency: z.coerce.number().min(0).max(100).optional(),
  maxEfficiency: z.coerce.number().min(0).max(100).optional(),
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

/**
 * @swagger
 * /storage:
 *   get:
 *     summary: List storage efficiency logs
 *     description: >
 *       Returns per-transaction storage efficiency records showing declared
 *       footprint bytes vs actual bytes consumed. The delta (unusedBytes) is
 *       the unutilised storage space developers are paying rent on.
 *     tags: [Storage]
 *     parameters:
 *       - in: query
 *         name: contract
 *         schema: { type: string }
 *         description: Filter by contract address
 *       - in: query
 *         name: ledgerMin
 *         schema: { type: integer }
 *       - in: query
 *         name: ledgerMax
 *         schema: { type: integer }
 *       - in: query
 *         name: minEfficiency
 *         schema: { type: number, minimum: 0, maximum: 100 }
 *         description: Minimum efficiency percentage (0–100)
 *       - in: query
 *         name: maxEfficiency
 *         schema: { type: number, minimum: 0, maximum: 100 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated list of storage efficiency logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/StorageEfficiencyLog'
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 pages: { type: integer }
 */
storageRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = listSchema.parse(req.query);
    const where = {
      ...(q.contract && { contractAddress: q.contract }),
      ...((q.ledgerMin !== undefined || q.ledgerMax !== undefined) && {
        ledgerSequence: {
          ...(q.ledgerMin !== undefined && { gte: q.ledgerMin }),
          ...(q.ledgerMax !== undefined && { lte: q.ledgerMax }),
        },
      }),
      ...((q.minEfficiency !== undefined || q.maxEfficiency !== undefined) && {
        efficiencyPct: {
          ...(q.minEfficiency !== undefined && { gte: q.minEfficiency }),
          ...(q.maxEfficiency !== undefined && { lte: q.maxEfficiency }),
        },
      }),
    };

    const skip = (q.page - 1) * q.limit;
    const [data, total] = await Promise.all([
      prisma.storageEfficiencyLog.findMany({
        where,
        orderBy: { ledgerSequence: 'desc' },
        skip,
        take: q.limit,
      }),
      prisma.storageEfficiencyLog.count({ where }),
    ]);

    res.json({ data, total, page: q.page, limit: q.limit, pages: Math.ceil(total / q.limit) });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

/**
 * @swagger
 * /storage/{txHash}:
 *   get:
 *     summary: Get storage efficiency log for a transaction
 *     description: >
 *       Returns the storage footprint vs actual usage breakdown for a single
 *       transaction. Use unusedBytes to see how much rent-paying storage was
 *       declared but not consumed.
 *     tags: [Storage]
 *     parameters:
 *       - in: path
 *         name: txHash
 *         required: true
 *         schema: { type: string }
 *         description: Transaction hash
 *     responses:
 *       200:
 *         description: Storage efficiency log
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StorageEfficiencyLog'
 *       404:
 *         description: Not found
 */
storageRouter.get('/:txHash', async (req: Request, res: Response) => {
  const row = await prisma.storageEfficiencyLog.findUnique({
    where: { transactionHash: req.params.txHash },
  });
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
