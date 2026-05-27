import { Router, Request, Response } from 'express';
import { prismaRead as prisma } from '../db';
import { z } from 'zod';

export const eventRouter = Router();

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// GET /events?contract=&type=&page=1
eventRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const { contract, type } = req.query as Record<string, string>;
    const skip = (page - 1) * limit;

    const where = {
      ...(contract && { contractAddress: contract }),
      ...(type && { eventType: type }),
    };

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: { ledgerSequence: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          transactionHash: true,
          contractAddress: true,
          eventType: true,
          decoded: true,
          ledgerSequence: true,
          ledgerCloseTime: true,
        },
      }),
      prisma.event.count({ where }),
    ]);

    res.json({ data: events, total, page, limit });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /events/:id
eventRouter.get('/:id', async (req: Request, res: Response) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});
