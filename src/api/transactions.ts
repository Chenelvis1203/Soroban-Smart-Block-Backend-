import { Router, Request, Response } from 'express';
import { prismaRead as prisma } from '../db';
import { z } from 'zod';

export const transactionRouter = Router();

const TX_SELECT = {
  hash: true,
  ledgerSequence: true,
  ledgerCloseTime: true,
  sourceAccount: true,
  contractAddress: true,
  functionName: true,
  status: true,
  humanReadable: true,
  feeCharged: true,
};

const listSchema = z.object({
  // cursor-based (preferred for large datasets)
  cursor: z.string().optional(),          // opaque cursor = last tx `id` (cuid)
  // offset-based fallback
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(100).default(20),
  // filters
  contract:  z.string().optional(),
  account:   z.string().optional(),
  status:    z.string().optional(),
  ledgerMin: z.coerce.number().int().min(0).optional(),
  ledgerMax: z.coerce.number().int().min(0).optional(),
});

// GET /transactions
// Cursor mode:  ?cursor=<id>&limit=20&contract=...&ledgerMin=100&ledgerMax=200
// Offset mode:  ?page=2&limit=20&contract=...
transactionRouter.get('/', async (req: Request, res: Response) => {
  try {
    const q = listSchema.parse(req.query);

    const where = {
      ...(q.contract  && { contractAddress: q.contract }),
      ...(q.account   && { sourceAccount: q.account }),
      ...(q.status    && { status: q.status }),
      ...((q.ledgerMin !== undefined || q.ledgerMax !== undefined) && {
        ledgerSequence: {
          ...(q.ledgerMin !== undefined && { gte: q.ledgerMin }),
          ...(q.ledgerMax !== undefined && { lte: q.ledgerMax }),
        },
      }),
    };

    if (q.cursor) {
      // Cursor-based: fetch limit+1 to determine if there's a next page
      const rows = await prisma.transaction.findMany({
        where,
        orderBy: [{ ledgerSequence: 'desc' }, { id: 'desc' }],
        cursor: { id: q.cursor },
        skip: 1,           // skip the cursor row itself
        take: q.limit + 1,
        select: TX_SELECT,
      });

      const hasNext = rows.length > q.limit;
      const data = hasNext ? rows.slice(0, q.limit) : rows;
      const nextCursor = hasNext ? (data[data.length - 1] as any).id : null;

      // TX_SELECT omits `id`; re-fetch last id for cursor only when needed
      const nextCursorId = hasNext
        ? await prisma.transaction
            .findFirst({
              where: { hash: (data[data.length - 1] as any).hash },
              select: { id: true },
            })
            .then((r) => r?.id ?? null)
        : null;

      return res.json({ data, nextCursor: nextCursorId, hasNext });
    }

    // Offset-based fallback
    const skip = (q.page - 1) * q.limit;
    const [data, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: [{ ledgerSequence: 'desc' }, { id: 'desc' }],
        skip,
        take: q.limit,
        select: TX_SELECT,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ data, total, page: q.page, limit: q.limit, pages: Math.ceil(total / q.limit) });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /transactions/:hash
transactionRouter.get('/:hash', async (req: Request, res: Response) => {
  const tx = await prisma.transaction.findUnique({
    where: { hash: req.params.hash },
    include: { events: true },
  });
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  res.json(tx);
});
