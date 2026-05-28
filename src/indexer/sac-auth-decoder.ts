/**
 * #61 SAC (Stellar Asset Contract) Native Auth Decoder
 *
 * Translation rule engine for built-in Stellar Asset Contract authorization
 * signatures.  Intercepts classic multi-sig envelopes wrapping Soroban host
 * operations and evaluates complex threshold weights (Low / Medium / High)
 * for end-user auditing.
 */

import { xdr, StrKey } from '@stellar/stellar-sdk';
import { scValToJson } from './xdr-parser';

// ── Types ────────────────────────────────────────────────────────────────────

export type ThresholdLevel = 'none' | 'low' | 'medium' | 'high';

export interface SacSignerInfo {
  publicKey: string;
  weight: number;
  signed: boolean;
}

export interface SacThresholdEvaluation {
  lowThreshold: number;
  medThreshold: number;
  highThreshold: number;
  signers: SacSignerInfo[];
  weightAchieved: number;
  thresholdMet: ThresholdLevel;
  /** Weight still needed to reach the next threshold level */
  marginToNext: number | null;
  passed: boolean;
  summary: string;
}

export interface SacAuthDecoded {
  /** The SAC contract address (C-address) */
  sacAddress: string;
  /** Classic asset code, e.g. "USDC" or "XLM" */
  assetCode: string;
  /** Classic asset issuer (null for native XLM) */
  assetIssuer: string | null;
  /** SAC function being authorized, e.g. "transfer", "mint", "burn" */
  functionName: string;
  /** Decoded function arguments */
  args: Array<{ index: number; type: string; value: unknown }>;
  /** Multi-sig threshold evaluation (null for single-sig) */
  thresholdEval: SacThresholdEvaluation | null;
  /** Human-readable audit line */
  humanReadable: string;
}

// ── SAC function name → human label ─────────────────────────────────────────

const SAC_FUNCTION_LABELS: Record<string, string> = {
  transfer: 'Transfer',
  transfer_from: 'Transfer (delegated)',
  mint: 'Mint',
  burn: 'Burn',
  burn_from: 'Burn (delegated)',
  clawback: 'Clawback',
  set_admin: 'Set admin',
  set_authorized: 'Set authorized',
  approve: 'Approve allowance',
  allowance: 'Query allowance',
  balance: 'Query balance',
  decimals: 'Query decimals',
  name: 'Query name',
  symbol: 'Query symbol',
};

// ── Threshold helpers ────────────────────────────────────────────────────────

function evaluateThresholds(
  lowThreshold: number,
  medThreshold: number,
  highThreshold: number,
  weightAchieved: number
): { thresholdMet: ThresholdLevel; marginToNext: number | null } {
  if (weightAchieved >= highThreshold && highThreshold > 0) {
    return { thresholdMet: 'high', marginToNext: null };
  }
  if (weightAchieved >= medThreshold && medThreshold > 0) {
    const margin = highThreshold > 0 ? highThreshold - weightAchieved : null;
    return { thresholdMet: 'medium', marginToNext: margin };
  }
  if (weightAchieved >= lowThreshold && lowThreshold > 0) {
    const margin = medThreshold > 0 ? medThreshold - weightAchieved : null;
    return { thresholdMet: 'low', marginToNext: margin };
  }
  return { thresholdMet: 'none', marginToNext: lowThreshold > 0 ? lowThreshold - weightAchieved : null };
}

// ── Signature extraction ─────────────────────────────────────────────────────

/**
 * Extract the set of public keys that actually signed a transaction envelope.
 */
function extractSignerKeys(envelope: xdr.TransactionEnvelope): Set<string> {
  const signed = new Set<string>();
  try {
    const decoratedSigs: xdr.DecoratedSignature[] =
      envelope.switch().name === 'envelopeTypeTx'
        ? envelope.v1().signatures()
        : envelope.v0().signatures();

    for (const ds of decoratedSigs) {
      // hint is the last 4 bytes of the public key
      signed.add(Buffer.from(ds.hint()).toString('hex'));
    }
  } catch {
    // ignore
  }
  return signed;
}

// ── SAC detection ────────────────────────────────────────────────────────────

/**
 * Determine whether a contract address is a SAC by checking if the auth
 * entry's function name is a known SAC function.
 * (Full on-chain SAC detection would require an RPC call; this heuristic
 * covers the common case without a network round-trip.)
 */
function isSacFunction(functionName: string): boolean {
  return functionName in SAC_FUNCTION_LABELS;
}

// ── Main decoder ─────────────────────────────────────────────────────────────

/**
 * Decode SAC-related authorization entries from a transaction envelope.
 *
 * For each InvokeHostFunction auth entry whose function name matches a known
 * SAC function, returns a decoded SacAuthDecoded record including:
 *  - asset identification
 *  - function label
 *  - multi-sig threshold evaluation (when the source account has multiple signers)
 */
export function decodeSacAuth(
  envelopeXdr: string,
  /** Optional: account signers from Horizon for multi-sig evaluation */
  accountSigners?: Array<{ key: string; weight: number }>,
  thresholds?: { low: number; med: number; high: number }
): SacAuthDecoded[] {
  let envelope: xdr.TransactionEnvelope;
  try {
    envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdr, 'base64');
  } catch {
    return [];
  }

  const ops: xdr.Operation[] =
    envelope.switch().name === 'envelopeTypeTx'
      ? envelope.v1().tx().operations()
      : envelope.switch().name === 'envelopeTypeTxV0'
      ? envelope.v0().tx().operations()
      : [];

  const invokeOp = ops.find((op) => op.body().switch().name === 'invokeHostFunction');
  if (!invokeOp) return [];

  const authEntries: xdr.SorobanAuthorizationEntry[] =
    invokeOp.body().invokeHostFunctionOp().auth();

  const signedHints = extractSignerKeys(envelope);
  const results: SacAuthDecoded[] = [];

  for (const entry of authEntries) {
    const rootFn = entry.rootInvocation().function();
    if (rootFn.switch().name !== 'sorobanAuthorizedFunctionTypeContractFn') continue;

    const contractFn = rootFn.contractFn();
    const functionName = contractFn.functionName().toString();
    if (!isSacFunction(functionName)) continue;

    const sacAddress = StrKey.encodeContract(contractFn.contractAddress().contractId());

    // Decode args
    const args = contractFn.args().map((a: xdr.ScVal, i: number) => {
      try {
        return { index: i, ...scValToJson(a) };
      } catch {
        return { index: i, type: 'unknown', value: null };
      }
    });

    // Derive asset info from SAC address heuristic
    // (SAC addresses encode the asset; full decode needs network passphrase)
    const assetCode = deriveAssetCodeFromArgs(functionName, args) ?? 'UNKNOWN';
    const assetIssuer = deriveAssetIssuerFromArgs(args);

    // Multi-sig threshold evaluation
    let thresholdEval: SacThresholdEvaluation | null = null;
    if (accountSigners && thresholds && accountSigners.length > 1) {
      const signerInfos: SacSignerInfo[] = accountSigners.map((s) => {
        const hint = Buffer.from(
          Buffer.from(s.key.length === 56 ? StrKey.decodeEd25519PublicKey(s.key) : Buffer.from(s.key, 'hex'))
        ).slice(-4).toString('hex');
        return { publicKey: s.key, weight: s.weight, signed: signedHints.has(hint) };
      });

      const weightAchieved = signerInfos
        .filter((s) => s.signed)
        .reduce((sum, s) => sum + s.weight, 0);

      const { thresholdMet, marginToNext } = evaluateThresholds(
        thresholds.low, thresholds.med, thresholds.high, weightAchieved
      );

      const passed = thresholdMet !== 'none';
      const signerSummary = signerInfos
        .filter((s) => s.signed)
        .map((s) => `${s.publicKey.slice(0, 8)}…(w=${s.weight})`)
        .join(', ');

      thresholdEval = {
        lowThreshold: thresholds.low,
        medThreshold: thresholds.med,
        highThreshold: thresholds.high,
        signers: signerInfos,
        weightAchieved,
        thresholdMet,
        marginToNext,
        passed,
        summary:
          `${SAC_FUNCTION_LABELS[functionName] ?? functionName} on ${assetCode}: ` +
          `weight ${weightAchieved} achieved ${thresholdMet} threshold` +
          (passed ? '' : ' (FAILED)') +
          (signerSummary ? ` — signed by: ${signerSummary}` : ''),
      };
    }

    const label = SAC_FUNCTION_LABELS[functionName] ?? functionName;
    const humanReadable =
      thresholdEval
        ? thresholdEval.summary
        : `SAC ${label} on ${assetCode}${assetIssuer ? ` (issuer: ${assetIssuer.slice(0, 8)}…)` : ''} via ${sacAddress.slice(0, 8)}…`;

    results.push({ sacAddress, assetCode, assetIssuer, functionName, args, thresholdEval, humanReadable });
  }

  return results;
}

// ── Arg-based asset heuristics ───────────────────────────────────────────────

function deriveAssetCodeFromArgs(
  functionName: string,
  args: Array<{ index: number; type: string; value: unknown }>
): string | null {
  // For SAC functions the asset is encoded in the contract address itself;
  // we can surface it from a "symbol" arg if present (e.g. from name/symbol calls)
  const symbolArg = args.find((a) => a.type === 'symbol' || a.type === 'string');
  if (symbolArg) return String(symbolArg.value);
  return null;
}

function deriveAssetIssuerFromArgs(
  args: Array<{ index: number; type: string; value: unknown }>
): string | null {
  // Issuer is typically an address arg (admin / issuer position)
  const addrArg = args.find((a) => a.type === 'address');
  if (addrArg) return String(addrArg.value);
  return null;
}
