/**
 * #58 Evicted Data Restoration Indexer
 *
 * Detects RestoreFootprintOp operations in transaction envelopes.
 * When found:
 *  - Updates matching ContractState rows from "Archived" → "Live"
 *  - Writes a RestorationLog row recording the fee, payer, and restored keys
 */

import { xdr, StrKey } from '@stellar/stellar-sdk';
import { prismaWrite as prisma } from '../db';

export interface RestoredKey {
  ledgerKey: string;       // base64 XDR of the LedgerKey
  contractAddress: string; // decoded contract address (if contractData/contractCode)
}

/**
 * Parse a transaction envelope XDR and extract any RestoreFootprintOp
 * footprint keys.  Returns null if the tx contains no RestoreFootprintOp.
 */
export function parseRestoreFootprint(envelopeXdr: string): RestoredKey[] | null {
  let envelope: xdr.TransactionEnvelope;
  try {
    envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');
  } catch {
    return null;
  }

  const ops: xdr.Operation[] =
    envelope.switch().name === 'envelopeTypeTx'
      ? envelope.v1().tx().operations()
      : envelope.switch().name === 'envelopeTypeTxV0'
      ? envelope.v0().tx().operations()
      : [];

  const restoreOp = ops.find(
    (op) => op.body().switch().name === 'restoreFootprint'
  );
  if (!restoreOp) return null;

  const footprint = restoreOp.body().restoreFootprintOp().footprint();
  const keys: RestoredKey[] = [];

  for (const lk of [...footprint.readOnly(), ...footprint.readWrite()]) {
    const ledgerKey = lk.toXDR('base64');
    let contractAddress = 'unknown';
    try {
      if (lk.switch().name === 'contractData') {
        contractAddress = StrKey.encodeContract(lk.contractData().contract().contractId());
      } else if (lk.switch().name === 'contractCode') {
        contractAddress = Buffer.from(lk.contractCode().hash()).toString('hex');
      }
    } catch {
      // leave as 'unknown'
    }
    keys.push({ ledgerKey, contractAddress });
  }

  return keys.length > 0 ? keys : null;
}

/**
 * Process a single transaction for RestoreFootprintOp.
 * Writes RestorationLog and updates ContractState rows.
 */
export async function indexRestoration(params: {
  transactionHash: string;
  sourceAccount: string;
  ledgerSequence: number;
  ledgerCloseTime: Date;
  feeCharged: string | null;
  envelopeXdr: string;
}): Promise<boolean> {
  const { transactionHash, sourceAccount, ledgerSequence, ledgerCloseTime, feeCharged, envelopeXdr } = params;

  const restoredKeys = parseRestoreFootprint(envelopeXdr);
  if (!restoredKeys) return false;

  // Persist restoration log (idempotent via unique transactionHash)
  await prisma.restorationLog.upsert({
    where: { transactionHash },
    update: {},
    create: {
      transactionHash,
      sourceAccount,
      ledgerSequence,
      ledgerCloseTime,
      feeCharged,
      restoredKeys: restoredKeys as unknown as object,
    },
  });

  // Update ContractState rows: Archived → Live
  for (const { ledgerKey, contractAddress } of restoredKeys) {
    await prisma.contractState.updateMany({
      where: { ledgerKey, status: { in: ['Archived', 'Dead'] } },
      data: {
        status: 'Live',
        restoredAtLedger: ledgerSequence,
        lastSeenLedger: ledgerSequence,
        updatedAt: new Date(),
      },
    });

    // If no existing row, create a Live one so future eviction checks work
    await prisma.contractState.upsert({
      where: { contractAddress_ledgerKey: { contractAddress, ledgerKey } },
      update: {
        status: 'Live',
        restoredAtLedger: ledgerSequence,
        lastSeenLedger: ledgerSequence,
        updatedAt: new Date(),
      },
      create: {
        contractAddress,
        ledgerKey,
        keyType: 'contractData',
        status: 'Live',
        restoredAtLedger: ledgerSequence,
        lastSeenLedger: ledgerSequence,
      },
    });
  }

  console.log(
    `[restoration-indexer] tx ${transactionHash}: restored ${restoredKeys.length} key(s) ` +
    `at ledger ${ledgerSequence} (payer: ${sourceAccount})`
  );
  return true;
}
