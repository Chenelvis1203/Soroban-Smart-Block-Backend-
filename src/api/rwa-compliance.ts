import { Router, Request, Response } from 'express';
import { prismaRead } from '../db';

export const rwaComplianceRouter = Router();

// GET /compliance/asset/:assetAddress
rwaComplianceRouter.get('/asset/:assetAddress', async (req: Request, res: Response) => {
  try {
    const events = await prismaRead.rwaComplianceEvent.findMany({
      where: { assetContractAddress: req.params.assetAddress },
      orderBy: { ledgerSequence: 'desc' },
      take: 100,
    });

    res.json({
      assetAddress: req.params.assetAddress,
      eventCount: events.length,
      events: events.map((e) => ({
        transactionHash: e.transactionHash,
        ledgerSequence: e.ledgerSequence,
        issuer: e.issuerAddress,
        targetAddress: e.targetAddress,
        amount: e.amount,
        complianceReason: e.complianceReason,
        humanStatement: e.humanStatement,
      })),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /compliance/address/:targetAddress
rwaComplianceRouter.get('/address/:targetAddress', async (req: Request, res: Response) => {
  try {
    const events = await prismaRead.rwaComplianceEvent.findMany({
      where: { targetAddress: req.params.targetAddress },
      orderBy: { ledgerSequence: 'desc' },
      take: 100,
    });

    res.json({
      targetAddress: req.params.targetAddress,
      clawbackCount: events.length,
      totalRecovered: events.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0),
      events: events.map((e) => ({
        assetAddress: e.assetContractAddress,
        amount: e.amount,
        reason: e.complianceReason,
        timestamp: e.ledgerCloseTime,
      })),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /compliance/issuer/:issuerAddress
rwaComplianceRouter.get('/issuer/:issuerAddress', async (req: Request, res: Response) => {
  try {
    const events = await prismaRead.rwaComplianceEvent.findMany({
      where: { issuerAddress: req.params.issuerAddress },
      orderBy: { ledgerSequence: 'desc' },
      take: 100,
    });

    res.json({
      issuerAddress: req.params.issuerAddress,
      actionCount: events.length,
      actions: events.map((e) => ({
        humanStatement: e.humanStatement,
        ledgerSequence: e.ledgerSequence,
        timestamp: e.ledgerCloseTime,
      })),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});
