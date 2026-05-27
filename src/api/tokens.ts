import { Router, Request, Response } from 'express';
import { prismaRead as prisma } from '../db';

export const tokenRouter = Router();

// GET /tokens — list all SEP-41 tokens
tokenRouter.get('/', async (_req: Request, res: Response) => {
  const tokens = await prisma.contract.findMany({
    where: { isToken: true },
    select: {
      address: true,
      tokenName: true,
      tokenSymbol: true,
      tokenDecimals: true,
    },
    orderBy: { tokenSymbol: 'asc' },
  });
  res.json(tokens);
});

// GET /tokens/:address
tokenRouter.get('/:address', async (req: Request, res: Response) => {
  const token = await prisma.contract.findFirst({
    where: { address: req.params.address, isToken: true },
  });
  if (!token) return res.status(404).json({ error: 'Token not found' });
  res.json(token);
});

// GET /tokens/:address/transfers
tokenRouter.get('/:address/transfers', async (req: Request, res: Response) => {
  const events = await prisma.event.findMany({
    where: { contractAddress: req.params.address, eventType: 'transfer' },
    orderBy: { ledgerSequence: 'desc' },
    take: 50,
    select: { id: true, transactionHash: true, decoded: true, ledgerSequence: true, ledgerCloseTime: true },
  });
  res.json(events);
});
