import { Router, Request, Response } from 'express';
import { prismaRead as prisma } from '../db';
import { z } from 'zod';
import { validateAddressParam } from '../middleware/sanitize';
import axios from 'axios';
import { config } from '../config';

export const walletRouter = Router();

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// GET /wallets/:address/transactions
walletRouter.get(
  '/:address/transactions',
  validateAddressParam('address'),
  async (req: Request, res: Response) => {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const skip = (page - 1) * limit;

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where: { sourceAccount: req.params.address },
          orderBy: { ledgerSequence: 'desc' },
          skip,
          take: limit,
          select: {
            hash: true,
            ledgerSequence: true,
            ledgerCloseTime: true,
            contractAddress: true,
            functionName: true,
            status: true,
            humanReadable: true,
          },
        }),
        prisma.transaction.count({ where: { sourceAccount: req.params.address } }),
      ]);

      res.json({ data: transactions, total, page, limit });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  },
);

// GET /wallets/:address/events — events involving this address
walletRouter.get(
  '/:address/events',
  validateAddressParam('address'),
  async (req: Request, res: Response) => {
    try {
      const { page, limit } = paginationSchema.parse(req.query);
      const skip = (page - 1) * limit;
      const address = req.params.address;

      // Fetch events where decoded JSON contains this address as from/to
      const [events, total] = await Promise.all([
        prisma.event.findMany({
          where: {
            OR: [
              { decoded: { path: ['from'], equals: address } },
              { decoded: { path: ['to'], equals: address } },
            ],
          },
          orderBy: { ledgerSequence: 'desc' },
          skip,
          take: limit,
        }),
        prisma.event.count({
          where: {
            OR: [
              { decoded: { path: ['from'], equals: address } },
              { decoded: { path: ['to'], equals: address } },
            ],
          },
        }),
      ]);

      res.json({ data: events, total, page, limit });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  },
);

// GET /wallets/:address/history — unified Soroban + classic Stellar history
walletRouter.get('/:address/history', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const address = req.params.address;

    // Fetch Soroban transactions and classic Horizon operations in parallel
    const [sorobanTxs, horizonOps] = await Promise.all([
      prisma.transaction.findMany({
        where: { sourceAccount: address },
        orderBy: { ledgerCloseTime: 'desc' },
        take: limit * 2, // over-fetch to allow merged sort
        select: {
          hash: true,
          ledgerSequence: true,
          ledgerCloseTime: true,
          contractAddress: true,
          functionName: true,
          status: true,
          humanReadable: true,
        },
      }),
      fetchHorizonOperations(address, limit * 2),
    ]);

    // Normalise into a unified shape
    const sorobanItems = sorobanTxs.map((tx) => ({
      type: 'soroban' as const,
      timestamp: tx.ledgerCloseTime,
      hash: tx.hash,
      ledgerSequence: tx.ledgerSequence,
      status: tx.status,
      contractAddress: tx.contractAddress ?? null,
      functionName: tx.functionName ?? null,
      humanReadable: tx.humanReadable ?? null,
      // classic fields not applicable
      operationType: null,
      amount: null,
      asset: null,
      from: null,
      to: null,
    }));

    const classicItems = horizonOps.map((op: any) => ({
      type: 'classic' as const,
      timestamp: new Date(op.created_at),
      hash: op.transaction_hash,
      ledgerSequence: null,
      status: op.transaction_successful ? 'success' : 'failed',
      contractAddress: null,
      functionName: null,
      humanReadable: null,
      operationType: op.type,
      amount: op.amount ?? op.starting_balance ?? null,
      asset: op.asset_type === 'native' ? 'XLM' : (op.asset_code ?? null),
      from: op.from ?? op.funder ?? null,
      to: op.to ?? op.account ?? null,
    }));

    // Merge and sort descending by timestamp
    const merged = [...sorobanItems, ...classicItems].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );

    // Apply pagination on merged result
    const skip = (page - 1) * limit;
    const paginated = merged.slice(skip, skip + limit);

    res.json({ data: paginated, total: merged.length, page, limit });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

async function fetchHorizonOperations(address: string, limit: number): Promise<any[]> {
  try {
    const url = `${config.horizonUrl}/accounts/${encodeURIComponent(address)}/operations`;
    const resp = await axios.get(url, {
      params: { limit, order: 'desc' },
      timeout: 10_000,
    });
    return resp.data?._embedded?.records ?? [];
  } catch {
    // Horizon unavailable or account not found — return empty rather than failing the whole request
    return [];
  }
}
