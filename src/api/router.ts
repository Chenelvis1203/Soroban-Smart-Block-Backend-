import { Router } from 'express';
import { transactionRouter } from './transactions';
import { eventRouter } from './events';
import { contractRouter } from './contracts';
import { walletRouter } from './wallets';
import { tokenRouter } from './tokens';
import { renderRouter } from './render';
import { simulateRouter } from './simulate';
import { verifyRouter } from './verify';
import { dexRouter } from './dex';

export const router = Router();

router.use('/transactions', transactionRouter);
router.use('/events', eventRouter);
router.use('/contracts', contractRouter);
router.use('/wallets', walletRouter);
router.use('/tokens', tokenRouter);
router.use('/render', renderRouter);
router.use('/simulate', simulateRouter);
router.use('/verify', verifyRouter);
router.use('/dex', dexRouter);
