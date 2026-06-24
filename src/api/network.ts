import { Router, Request, Response } from 'express';
import { config } from '../config';

export const networkRouter = Router();

networkRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    network: config.stellarNetwork,
    rpcUrl: config.stellarRpcUrl,
    passphrase: config.networkPassphrase,
    indexerStartLedger: config.indexerStartLedger,
  });
});
