import { Router, Request, Response } from 'express';
import { prismaRead as prisma } from '../db';
import { z } from 'zod';

export const walletRouter = Router();

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// GET /wallets/:address/transactions
walletRouter.get('/:address/transactions', async (req: Request, res: Response) => {
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
});

// GET /wallets/:address/events — events involving this address
walletRouter.get('/:address/events', async (req: Request, res: Response) => {
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
});
